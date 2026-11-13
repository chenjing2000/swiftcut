import { basename, dirname, extname, join } from 'node:path';
import { access, link, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { findAvailableBatchNames, getMediaOutputDir, getSourceStem } from '../common/mediaWorkspace.js';
import { buildCropConcatList } from './videoCropConcat.js';
import { runFfprobe, runScopedFfmpeg } from './ffmpeg.js';
import logger from './logger.js';
import type { AudioExtractionMode, Mp3Quality, AudioExtractionSegment } from './audioExtractionUtils.js';
import {
  buildMp3FfmpegArgs,
  buildOriginalAudioFfmpegArgs,
  createAudioExtractionTasks,
  getOriginalAudioOutputFormat,
  normalizeAudioExtractionSegments,
  parseFfprobeJson,
} from './audioExtractionUtils.js';

export type { AudioExtractionMode, Mp3Quality, AudioExtractionSegment } from './audioExtractionUtils.js';
export type AudioJobState = 'running' | 'paused' | 'success' | 'failed' | 'cancelled';
export type AudioExtractionTaskState = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';

export interface AudioExtractionTaskStatus {
  segmentNumber: number;
  trackNumber: number;
  streamIndex: number;
  state: AudioExtractionTaskState;
  progress: number;
  outputPath?: string;
  error?: string;
}

export interface AudioJobStatus {
  id: string;
  state: AudioJobState;
  progress: number;
  completedTasks: number;
  totalTasks: number;
  tasks: AudioExtractionTaskStatus[];
  outputPaths: string[];
  error?: string;
}

interface AudioJob {
  status: AudioJobStatus;
  cancel: (() => void) | undefined;
  cancelled: boolean;
  finalizing: boolean;
  resume: (() => void) | undefined;
}

const jobs = new Map<string, AudioJob>();
const MAX_RETAINED_COMPLETED_JOBS = 30;
const validQualities = new Set<Mp3Quality>(['vbr', '128k', '192k', '320k']);

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getAudioExtractionStatus(id: string): AudioJobStatus | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  return {
    ...job.status,
    tasks: job.status.tasks.map((task) => ({ ...task })),
    outputPaths: [...job.status.outputPaths],
  };
}

export function cancelAudioExtraction(id: string) {
  const job = jobs.get(id);
  if (job && !job.finalizing && (job.status.state === 'running' || job.status.state === 'paused')) {
    job.cancelled = true;
    job.cancel?.();
    job.resume?.();
    job.resume = undefined;
  }
}

export function resumeAudioExtraction(id: string) {
  const job = jobs.get(id);
  if (job?.status.state === 'paused' && !job.cancelled) {
    job.status.state = 'running';
    const { resume } = job;
    job.resume = undefined;
    resume?.();
  }
}

export function cancelAllAudioExtractions() {
  for (const [id] of jobs) cancelAudioExtraction(id);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

/** Publish verified media without ever replacing an existing destination. */
async function commitWithoutOverwrite(tempPath: string, outputPath: string) {
  try {
    await link(tempPath, outputPath);
  } catch (error) {
    if (getErrorCode(error) === 'EEXIST') throw new Error('Audio output was claimed by another export; retry the export', { cause: error });
    throw error;
  }
  await unlink(tempPath).catch((error: unknown) => {
    if (getErrorCode(error) !== 'ENOENT') logger.warn('Failed to remove linked temporary audio file', tempPath, error);
  });
  return outputPath;
}

async function probe(path: string) {
  const { stdout } = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'format=format_name,duration:stream=index,codec_type,codec_name',
    '-of', 'json',
    path,
  ]);
  return parseFfprobeJson(stdout);
}

function pruneCompletedJobs() {
  const completedJobIds: string[] = [];
  for (const [id, job] of jobs) {
    if (job.status.state !== 'running' && job.status.state !== 'paused') completedJobIds.push(id);
  }

  const excessCount = Math.max(0, completedJobIds.length - MAX_RETAINED_COMPLETED_JOBS + 1);
  for (const id of completedJobIds.slice(0, excessCount)) jobs.delete(id);
}

export async function startAudioExtraction(args: {
  inputPath: string;
  streamIndexes?: number[];
  /** Backward-compatible single-stream argument. */
  streamIndex?: number;
  mode?: AudioExtractionMode;
  quality?: Mp3Quality;
  segments?: AudioExtractionSegment[];
  outputMode?: 'merge' | 'separate';
}) {
  const {
    inputPath,
    quality = 'vbr',
    mode = 'mp3',
    outputMode = 'separate',
  } = args;
  const selectedStreamIndexes = args.streamIndexes
    ?? (args.streamIndex != null ? [args.streamIndex] : []);
  const requestedSegments = args.segments ?? [];

  if (typeof inputPath !== 'string' || extname(inputPath).toLowerCase() !== '.mp4') {
    throw new Error('Only local MP4 files are supported');
  }
  if (!Array.isArray(selectedStreamIndexes) || selectedStreamIndexes.length === 0) {
    throw new Error('Select at least one audio track');
  }
  if (selectedStreamIndexes.some((index) => !Number.isSafeInteger(index) || index < 0)) {
    throw new Error('Invalid audio stream index');
  }
  if (mode !== 'mp3' && mode !== 'original') throw new Error('Invalid audio extraction mode');
  if (outputMode !== 'merge' && outputMode !== 'separate') throw new Error('Invalid audio output mode');
  if (mode === 'mp3' && !validQualities.has(quality)) throw new Error('Invalid MP3 quality');
  if (!Array.isArray(requestedSegments)) throw new Error('Invalid extraction segments');

  const fileStat = await stat(inputPath);
  if (!fileStat.isFile()) throw new Error('Input must be a file');

  const info = await probe(inputPath);
  if (!info.format?.format_name?.split(',').includes('mp4')) throw new Error('Input is not an MP4 file');

  const audioStreams = (info.streams ?? [])
    .filter((stream) => stream.codec_type === 'audio')
    .toSorted((a, b) => a.index - b.index);
  const audioStreamIndexes = audioStreams.map((stream) => stream.index);

  const durationValue = Number(info.format?.duration);
  const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : undefined;
  const segments = normalizeAudioExtractionSegments(requestedSegments, duration);
  const entireSource = segments.length === 1 && segments[0]?.start === 0
    && (duration == null || (segments[0]?.end != null && Math.abs(segments[0].end - duration) < 0.01));
  const mergeRequested = outputMode === 'merge' && segments.length > 1;
  const tasks = createAudioExtractionTasks({
    segments,
    selectedStreamIndexes,
    audioStreamIndexes,
    entireSource,
  }).map((task) => {
    const stream = audioStreams.find((item) => item.index === task.streamIndex);
    const codecName = stream?.codec_name;
    if (mode === 'original' && !codecName) {
      throw new Error(`Cannot determine the codec for audio track ${task.trackNumber}`);
    }
    const originalOutputFormat = mode === 'original' ? getOriginalAudioOutputFormat(codecName!) : undefined;
    return {
      ...task,
      codecName,
      originalOutputFormat,
      outputExtension: originalOutputFormat?.extension ?? 'mp3',
    };
  });

  const id = randomUUID();
  const status: AudioJobStatus = {
    id,
    state: 'running',
    progress: 0,
    completedTasks: 0,
    totalTasks: tasks.length,
    tasks: tasks.map((task) => ({
      segmentNumber: task.segmentNumber,
      trackNumber: task.trackNumber,
      streamIndex: task.streamIndex,
      state: 'pending',
      progress: 0,
    })),
    outputPaths: [],
  };
  const job: AudioJob = { status, cancel: undefined, cancelled: false, finalizing: false, resume: undefined };
  pruneCompletedJobs();
  jobs.set(id, job);

  const outputDir = getMediaOutputDir(inputPath, 'audio');
  const sourceStem = getSourceStem(inputPath);
  const extractionTask = (async () => {
    const requestedNames = tasks.map((task) => `${sourceStem}${task.outputSuffix}.${task.outputExtension}`);
    const availableNames = mergeRequested ? [] : await findAvailableBatchNames(requestedNames, async (name) => exists(join(outputDir, name)));
    const staged: { task: (typeof tasks)[number]; path: string }[] = [];
    try {
      for (const [taskIndex, task] of tasks.entries()) {
        const taskStatus = status.tasks[taskIndex]!;
        if (job.cancelled) {
          taskStatus.state = 'skipped';
          continue;
        }

        taskStatus.state = 'running';
        let tempPath: string | undefined;

        try {
          const outputPath = join(outputDir, mergeRequested ? requestedNames[taskIndex]! : availableNames[taskIndex]!);
          // Cancellation may arrive while the output path is being prepared. In
          // that case no FFmpeg process has started, so this task was skipped.
          if (job.cancelled) {
            taskStatus.state = 'skipped';
            continue;
          }
          await mkdir(outputDir, { recursive: true });
          if (job.cancelled) {
            taskStatus.state = 'skipped';
            continue;
          }
          tempPath = join(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp.${task.outputExtension}`);
          const segment: AudioExtractionSegment = {
            start: task.start,
            ...(task.end != null && { end: task.end }),
          };
          const ffmpegArgs = mode === 'original'
            ? buildOriginalAudioFfmpegArgs({
              inputPath,
              streamIndex: task.streamIndex,
              outputFormat: task.originalOutputFormat!,
              outputPath: tempPath,
              segment,
            })
            : buildMp3FfmpegArgs({
              inputPath,
              streamIndex: task.streamIndex,
              quality,
              outputPath: tempPath,
              segment,
            });
          const taskDuration = task.end != null ? task.end - task.start : undefined;
          const runner = runScopedFfmpeg({
            ffmpegArgs,
            ...(taskDuration != null && taskDuration > 0 && { duration: taskDuration }),
            onProgress: (value) => {
              taskStatus.progress = Math.max(0, Math.min(1, value));
              status.progress = ((taskIndex + taskStatus.progress) / tasks.length) * (mergeRequested ? 0.85 : 1);
            },
          });
          job.cancel = runner.cancel;
          if (job.cancelled) runner.cancel();
          await runner.result;

          if (job.cancelled) throw new Error('Extraction cancelled');

          const verified = await probe(tempPath);
          const tempStat = await stat(tempPath);
          const outputAudioStreams = verified.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
          const expectedCodecName = mode === 'original' ? task.codecName : 'mp3';
          if (
            tempStat.size === 0
            || outputAudioStreams.length !== 1
            || outputAudioStreams[0]?.codec_name !== expectedCodecName
          ) {
            throw new Error(mode === 'original' ? 'Original audio stream validation failed' : 'Output MP3 validation failed');
          }
          if (job.cancelled) throw new Error('Extraction cancelled');

          if (mergeRequested) {
            staged.push({ task, path: tempPath });
            tempPath = undefined;
            taskStatus.progress = 1;
            taskStatus.state = 'success';
          } else {
            const finalPath = await commitWithoutOverwrite(tempPath, outputPath);
            tempPath = undefined;
            taskStatus.outputPath = finalPath;
            taskStatus.progress = 1;
            taskStatus.state = 'success';
            status.outputPaths.push(finalPath);
          }
        } catch (error) {
          if (job.cancelled) {
            // Aborting FFmpeg is an expected cancellation path, not an error.
            taskStatus.state = 'cancelled';
            delete taskStatus.error;
          } else {
            taskStatus.state = 'failed';
            taskStatus.error = getErrorMessage(error);
            logger.error('Audio extraction task failed', taskStatus.error);
          }
        } finally {
          if (tempPath) {
            await unlink(tempPath).catch((error: unknown) => {
              if (getErrorCode(error) !== 'ENOENT') logger.warn('Failed to remove temporary audio file', tempPath, error);
            });
          }
          job.cancel = undefined;
          status.completedTasks = status.tasks.filter((item) => item.state !== 'pending' && item.state !== 'running').length;
          status.progress = (status.completedTasks / tasks.length) * (mergeRequested ? 0.85 : 1);
        }

        if (job.cancelled || taskStatus.state !== 'failed') continue;

        status.state = 'paused';
        await new Promise<void>((resolve) => {
          job.resume = resolve;
        });
        job.resume = undefined;
        if (!job.cancelled) status.state = 'running';
      }

      if (mergeRequested && !job.cancelled && status.tasks.every((task) => task.state === 'success')) {
        const mergedTemps: { path: string; name: string }[] = [];
        const concatLists: string[] = [];
        try {
          for (const [trackIndex, streamIndex] of selectedStreamIndexes.entries()) {
            if (job.cancelled) break;
            const pieces = staged.filter(({ task }) => task.streamIndex === streamIndex)
              .toSorted((a, b) => a.task.segmentNumber - b.task.segmentNumber);
            if (pieces.length !== segments.length) throw new Error('Audio merge is missing an extracted segment');
            const first = pieces[0]!.task;
            const extension = first.outputExtension;
            const muxer = mode === 'original' ? first.originalOutputFormat!.muxer : 'mp3';
            const trackSuffix = selectedStreamIndexes.length > 1 ? `_track_${String(trackIndex + 1).padStart(2, '0')}` : '';
            const name = `${sourceStem}_segments_merge${trackSuffix}.${extension}`;
            const listPath = join(outputDir, `.${randomUUID()}.ffconcat`);
            concatLists.push(listPath);
            await writeFile(listPath, buildCropConcatList(pieces.map(({ path }) => path)), 'utf8');
            const mergedTemp = join(outputDir, `.${randomUUID()}.tmp.${extension}`);
            mergedTemps.push({ path: mergedTemp, name });
            const runner = runScopedFfmpeg({
              ffmpegArgs: ['-hide_banner', '-nostdin', '-n', '-f', 'concat', '-safe', '0', '-i', listPath,
                '-map', '0:a:0', '-c:a', 'copy', '-f', muxer, mergedTemp],
              duration: segments.reduce((sum, seg) => sum + (seg.end ?? seg.start) - seg.start, 0),
              onProgress: (value) => {
                status.progress = 0.85 + ((trackIndex + Math.max(0, Math.min(1, value))) / selectedStreamIndexes.length) * 0.14;
              },
            });
            job.cancel = runner.cancel;
            if (job.cancelled) runner.cancel();
            await runner.result;
            job.cancel = undefined;
            if (job.cancelled) break;
            const verified = await probe(mergedTemp);
            const mergedStat = await stat(mergedTemp);
            const outputStreams = verified.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
            if (mergedStat.size === 0 || outputStreams.length !== 1
              || outputStreams[0]?.codec_name !== (mode === 'original' ? first.codecName : 'mp3')) {
              throw new Error('Merged audio output validation failed');
            }
          }

          if (!job.cancelled) {
            // Commit the complete multi-track batch with a common collision index.
            job.finalizing = true;
            const names = mergedTemps.map(({ name }) => name);
            for (let attempt = 0; attempt < 10000; attempt += 1) {
              const candidates = await findAvailableBatchNames(names, async (name) => exists(join(outputDir, name)));
              const created: string[] = [];
              try {
                for (const [index, item] of mergedTemps.entries()) {
                  const target = join(outputDir, candidates[index]!);
                  await link(item.path, target);
                  created.push(target);
                }
                status.outputPaths.push(...created);
                status.progress = 1;
                break;
              } catch (error) {
                const rollback = await Promise.allSettled(created.map((path) => unlink(path)));
                const rollbackError = rollback.find((result) => result.status === 'rejected');
                if (rollbackError?.status === 'rejected') {
                  throw new Error('Cannot rollback incomplete merged audio output batch', { cause: error });
                }
                if (getErrorCode(error) !== 'EEXIST' || attempt === 9999) throw error;
              }
            }
          }
        } catch (error) {
          status.error = getErrorMessage(error);
          logger.error('Failed to merge audio segments', error);
        } finally {
          job.cancel = undefined;
          await Promise.allSettled([...mergedTemps.map(({ path }) => unlink(path)), ...concatLists.map((path) => unlink(path))]);
        }
      }

      if (job.cancelled) {
        for (const taskStatus of status.tasks) {
          if (taskStatus.state === 'pending') taskStatus.state = 'skipped';
        }
      }

      const failedCount = status.tasks.filter((task) => task.state === 'failed').length;
      status.completedTasks = status.tasks.filter((task) => task.state !== 'pending' && task.state !== 'running').length;
      if (!mergeRequested) status.progress = status.completedTasks / tasks.length;
      if (job.cancelled) {
        status.state = 'cancelled';
      } else if (failedCount > 0 || status.error || (mergeRequested && status.outputPaths.length === 0)) {
        status.state = 'failed';
      } else {
        status.state = 'success';
      }
      if (failedCount > 0) status.error = `${failedCount} of ${tasks.length} extraction task(s) failed`;
    } finally {
      await Promise.allSettled(staged.map(({ path }) => unlink(path)));
    }
  })();

  extractionTask.catch((error: unknown) => {
    for (const taskStatus of status.tasks) {
      if (taskStatus.state === 'pending') {
        taskStatus.state = 'skipped';
      } else if (taskStatus.state === 'running') {
        if (job.cancelled) {
          taskStatus.state = 'cancelled';
          delete taskStatus.error;
        } else {
          taskStatus.state = 'failed';
          taskStatus.error = getErrorMessage(error);
        }
      }
    }

    status.completedTasks = status.tasks.filter((task) => task.state !== 'pending' && task.state !== 'running').length;
    if (job.cancelled) {
      status.state = 'cancelled';
      delete status.error;
    } else {
      status.state = 'failed';
      status.error = getErrorMessage(error);
      logger.error('Unexpected audio extraction task failure', error);
    }
  });

  return id;
}


/** @deprecated Use startAudioExtraction. */
export const startMp3Extraction = startAudioExtraction;

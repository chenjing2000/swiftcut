import { basename, dirname, extname, join } from 'node:path';
import { access, link, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runFfprobe, runScopedFfmpeg } from './ffmpeg.js';
import logger from './logger.js';
import type { Mp3Quality, AudioExtractionSegment } from './audioExtractionUtils.js';
import {
  buildMp3FfmpegArgs,
  createAudioExtractionTasks,
  normalizeAudioExtractionSegments,
  parseFfprobeJson,
} from './audioExtractionUtils.js';

export type { Mp3Quality, AudioExtractionSegment } from './audioExtractionUtils.js';
export type AudioJobState = 'running' | 'success' | 'failed' | 'cancelled';
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
}

const jobs = new Map<string, AudioJob>();
const MAX_RETAINED_COMPLETED_JOBS = 30;
const validQualities = new Set<Mp3Quality>(['vbr', '320k', '192k']);

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
  if (job?.status.state === 'running') {
    job.cancelled = true;
    job.cancel?.();
  }
}

export function cancelAllAudioExtractions() {
  for (const [id] of jobs) cancelAudioExtraction(id);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findAvailablePath(inputPath: string, suffix: string, reservedPaths: Set<string>) {
  const base = basename(inputPath, extname(inputPath));
  const folder = dirname(inputPath);
  for (let index = 0; index < 10000; index += 1) {
    const collisionSuffix = index === 0 ? '' : `_${index}`;
    const candidate = join(folder, `${base}${suffix}${collisionSuffix}.mp3`);
    if (!reservedPaths.has(candidate) && !(await exists(candidate))) {
      reservedPaths.add(candidate);
      return candidate;
    }
  }
  throw new Error('No available MP3 output filename');
}

async function commitWithoutOverwrite({
  tempPath,
  initialOutputPath,
  inputPath,
  suffix,
  reservedPaths,
}: {
  tempPath: string;
  initialOutputPath: string;
  inputPath: string;
  suffix: string;
  reservedPaths: Set<string>;
}) {
  let outputPath = initialOutputPath;
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    try {
      await link(tempPath, outputPath);
      await unlink(tempPath).catch((error: unknown) => {
        if (getErrorCode(error) !== 'ENOENT') logger.warn('Failed to remove linked temporary MP3 file', tempPath, error);
      });
      return outputPath;
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') throw error;
      outputPath = await findAvailablePath(inputPath, suffix, reservedPaths);
    }
  }
  throw new Error('No available MP3 output filename');
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
    if (job.status.state !== 'running') completedJobIds.push(id);
  }

  const excessCount = Math.max(0, completedJobIds.length - MAX_RETAINED_COMPLETED_JOBS + 1);
  for (const id of completedJobIds.slice(0, excessCount)) jobs.delete(id);
}

export async function startMp3Extraction(args: {
  inputPath: string;
  streamIndexes?: number[];
  /** Backward-compatible single-stream argument. */
  streamIndex?: number;
  quality: Mp3Quality;
  segments?: AudioExtractionSegment[];
}) {
  const {
    inputPath,
    quality,
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
  if (!validQualities.has(quality)) throw new Error('Invalid MP3 quality');
  if (!Array.isArray(requestedSegments)) throw new Error('Invalid extraction segments');

  const fileStat = await stat(inputPath);
  if (!fileStat.isFile()) throw new Error('Input must be a file');

  const info = await probe(inputPath);
  if (!info.format?.format_name?.split(',').includes('mp4')) throw new Error('Input is not an MP4 file');

  const audioStreamIndexes = (info.streams ?? [])
    .filter((stream) => stream.codec_type === 'audio')
    .map((stream) => stream.index)
    .toSorted((a, b) => a - b);

  const durationValue = Number(info.format?.duration);
  const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : undefined;
  const segments = normalizeAudioExtractionSegments(requestedSegments, duration);
  const tasks = createAudioExtractionTasks({
    segments,
    selectedStreamIndexes,
    audioStreamIndexes,
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
  const job: AudioJob = { status, cancel: undefined, cancelled: false };
  pruneCompletedJobs();
  jobs.set(id, job);

  const reservedPaths = new Set<string>();
  const extractionTask = (async () => {
    for (const [taskIndex, task] of tasks.entries()) {
      const taskStatus = status.tasks[taskIndex]!;
      if (job.cancelled) {
        taskStatus.state = 'skipped';
        continue;
      }

      taskStatus.state = 'running';
      let tempPath: string | undefined;

      try {
        const outputPath = await findAvailablePath(inputPath, task.outputSuffix, reservedPaths);
        // Cancellation may arrive while the output path is being prepared. In
        // that case no FFmpeg process has started, so this task was skipped.
        if (job.cancelled) {
          taskStatus.state = 'skipped';
          continue;
        }
        tempPath = join(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp.mp3`);
        const segment: AudioExtractionSegment = {
          start: task.start,
          ...(task.end != null && { end: task.end }),
        };
        const ffmpegArgs = buildMp3FfmpegArgs({
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
            status.progress = (taskIndex + taskStatus.progress) / tasks.length;
          },
        });
        job.cancel = runner.cancel;
        if (job.cancelled) runner.cancel();
        await runner.result;

        if (job.cancelled) throw new Error('Extraction cancelled');

        const verified = await probe(tempPath);
        const tempStat = await stat(tempPath);
        if (
          tempStat.size === 0
          || !verified.streams?.some((stream) => stream.codec_type === 'audio' && stream.codec_name === 'mp3')
        ) {
          throw new Error('Output MP3 validation failed');
        }
        if (job.cancelled) throw new Error('Extraction cancelled');

        const finalPath = await commitWithoutOverwrite({
          tempPath,
          initialOutputPath: outputPath,
          inputPath,
          suffix: task.outputSuffix,
          reservedPaths,
        });
        tempPath = undefined;
        taskStatus.outputPath = finalPath;
        taskStatus.progress = 1;
        taskStatus.state = 'success';
        status.outputPaths.push(finalPath);
      } catch (error) {
        if (job.cancelled) {
          // Aborting FFmpeg is an expected cancellation path, not an error.
          taskStatus.state = 'cancelled';
          delete taskStatus.error;
        } else {
          taskStatus.state = 'failed';
          taskStatus.error = getErrorMessage(error);
          logger.error('MP3 extraction task failed', taskStatus.error);
        }
      } finally {
        if (tempPath) {
          await unlink(tempPath).catch((error: unknown) => {
            if (getErrorCode(error) !== 'ENOENT') logger.warn('Failed to remove temporary MP3 file', tempPath, error);
          });
        }
        job.cancel = undefined;
        status.completedTasks = status.tasks.filter((item) => item.state !== 'pending' && item.state !== 'running').length;
        if (!job.cancelled) status.progress = status.completedTasks / tasks.length;
      }
    }

    if (job.cancelled) {
      for (const taskStatus of status.tasks) {
        if (taskStatus.state === 'pending') taskStatus.state = 'skipped';
      }
    }

    const failedCount = status.tasks.filter((task) => task.state === 'failed').length;
    status.completedTasks = status.tasks.filter((task) => task.state !== 'pending' && task.state !== 'running').length;
    status.progress = status.completedTasks / tasks.length;
    if (job.cancelled) {
      status.state = 'cancelled';
    } else if (failedCount > 0) {
      status.state = 'failed';
    } else {
      status.state = 'success';
    }
    if (failedCount > 0) status.error = `${failedCount} of ${tasks.length} extraction task(s) failed`;
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
      logger.error('Unexpected MP3 extraction task failure', error);
    }
  });

  return id;
}

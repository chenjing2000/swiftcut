import { randomUUID } from 'node:crypto';
import { basename, join, parse } from 'node:path';
import { link, mkdir, rm, stat, unlink, writeFile } from 'node:fs/promises';

import type { CropExportPlan, CropExportTask } from '../common/videoCropTypes.js';
import { validateCropExportRequest } from '../common/videoCropValidation.js';
import { runFfprobe, runScopedFfmpeg } from './ffmpeg.js';
import { buildCropFfmpegArgs } from './videoCropFfmpegArgs.js';
import { buildCropConcatArgs, buildCropConcatList } from './videoCropConcat.js';
import logger from './logger.js';

export type CropExportState = 'preparing' | 'encoding' | 'merging' | 'verifying' | 'committing' | 'success' | 'failed' | 'cancelled';

export interface CropExportStatus {
  id: string;
  state: CropExportState;
  progress: number;
  outputPath?: string;
  outputPaths?: string[];
  completedSegments?: number;
  totalSegments?: number;
  error?: string;
}

interface CropJob {
  status: CropExportStatus;
  cancelled: boolean;
  cancelProcess?: () => void;
}

const jobs = new Map<string, CropJob>();
const MAX_COMPLETED = 20;

function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

function assertNotCancelled(job: CropJob) {
  if (job.cancelled) throw new Error('Crop export cancelled');
}

function pruneJobs() {
  const completed = [...jobs].filter(([, job]) => ['success', 'failed', 'cancelled'].includes(job.status.state));
  const excess = completed.slice(0, Math.max(0, completed.length - MAX_COMPLETED));
  for (const [id] of excess) jobs.delete(id);
}

export function getCropExportStatus(id: string): CropExportStatus | undefined {
  const job = jobs.get(id);
  return job == null ? undefined : { ...job.status, ...(job.status.outputPaths && { outputPaths: [...job.status.outputPaths] }) };
}

export function cancelCropExport(id: string): void {
  const job = jobs.get(id);
  if (job && !['success', 'failed', 'cancelled'].includes(job.status.state)) {
    job.cancelled = true;
    job.cancelProcess?.();
  }
}

export function cancelAllCropExports(): void {
  for (const id of jobs.keys()) cancelCropExport(id);
}

async function getOutputPath(outputDir: string, outputName: string) {
  const { name, ext } = parse(outputName);
  if (!name || !ext || basename(outputName) !== outputName) throw new Error('Invalid crop output filename');
  // Using hard links for the final commit eliminates TOCTOU overwrites.
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${attempt}`;
    const candidate = join(outputDir, `${name}${suffix}${ext}`);
    try {
      await stat(candidate);
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error('No available crop output filename');
}

async function commitWithoutOverwrite(tempPath: string, outputDir: string, outputName: string) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = await getOutputPath(outputDir, outputName);
    try {
      await link(tempPath, candidate);
      await unlink(tempPath).catch((error: unknown) => logger.warn('Cannot unlink committed crop temporary file', error));
      return candidate;
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') throw error;
    }
  }
  throw new Error('Cannot reserve crop output filename');
}

async function probeJson(path: string): Promise<{
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  format?: { duration?: string };
}> {
  const { stdout } = await runFfprobe([
    '-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height',
    '-of', 'json', path,
  ]);
  return JSON.parse(Buffer.from(stdout).toString('utf8')) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
    format?: { duration?: string };
  };
}

async function verifyOutput(path: string, plan: CropExportPlan, expectedDuration: number) {
  const file = await stat(path);
  if (!file.isFile() || file.size <= 0) throw new Error('Crop export output is empty');
  const metadata = await probeJson(path);
  const videos = metadata.streams?.filter((stream) => stream.codec_type === 'video') ?? [];
  const audio = metadata.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
  if (videos.length !== 1 || videos[0]?.codec_name !== 'h264'
    || videos[0].width !== plan.encodedWidth || videos[0].height !== plan.encodedHeight) {
    throw new Error('Crop video output verification failed');
  }
  const expectedAudio = plan.output.keepAudio && plan.audioStreamIndex != null ? 1 : 0;
  if (audio.length !== expectedAudio || (expectedAudio === 1 && audio[0]?.codec_name !== 'aac')) {
    throw new Error('Crop output audio verification failed');
  }
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration - expectedDuration) > Math.max(1, expectedDuration * 0.02)) {
    throw new Error('Crop output duration verification failed');
  }
}

// Crop Video exports are isolated from the application's ordinary lossless export.
export async function startCropExport(plan: CropExportPlan): Promise<string> {
  if (plan.tasks.length === 0) throw new Error('No crop export segments');
  if (plan.tasks.some((task) => !Number.isFinite(task.start) || !Number.isFinite(task.end)
    || task.start < 0 || task.end <= task.start)) throw new Error('Invalid crop export time ranges');
  if (plan.output.outputMode === 'merge' && plan.tasks.some((task, index) => index > 0
    && task.start < plan.tasks[index - 1]!.end)) {
    throw new Error('Overlapping crop segments cannot be merged');
  }
  const requestProblems = validateCropExportRequest({
    sourcePath: plan.sourcePath,
    outputDir: plan.outputDir,
    frame: plan.frame,
    videoStreamIndex: plan.videoStreamIndex,
    ...(plan.audioStreamIndex != null && { audioStreamIndex: plan.audioStreamIndex }),
    sourceDuration: Math.max(...plan.tasks.map((task) => task.end)),
    segments: plan.tasks.map(({ start, end, originalIndex }) => ({ start, end, originalIndex })),
    config: { rect: plan.crop, aspectPreset: 'free', output: plan.output },
  });
  if (requestProblems.some(({ field }) => field !== 'segments')) throw new Error('Invalid crop export plan');
  const source = await stat(plan.sourcePath);
  if (!source.isFile()) throw new Error('Crop source must be a local file');

  await mkdir(plan.outputDir, { recursive: true });
  const id = randomUUID();
  const job: CropJob = {
    status: { id, state: 'preparing', progress: 0, outputPaths: [], completedSegments: 0, totalSegments: plan.tasks.length },
    cancelled: false,
  };
  pruneJobs();
  jobs.set(id, job);
  const run = async () => {
    const workDir = join(plan.outputDir, '.swiftcut-crop-tmp', id);
    const totalDuration = plan.tasks.reduce((sum, task) => sum + task.end - task.start, 0);
    const merged = plan.output.outputMode === 'merge' && plan.tasks.length > 1;
    const encoded: { path: string; task: CropExportTask }[] = [];
    try {
      assertNotCancelled(job);
      await mkdir(workDir, { recursive: true });
      for (const [index, task] of plan.tasks.entries()) {
        assertNotCancelled(job);
        job.status.state = 'encoding';
        const temporary = join(workDir, `segment-${String(index + 1).padStart(3, '0')}.${plan.output.format}`);
        const elapsedBefore = encoded.reduce((sum, item) => sum + item.task.end - item.task.start, 0);
        const duration = task.end - task.start;
        const args = buildCropFfmpegArgs({ plan, task, outputPath: temporary });
        const runner = runScopedFfmpeg({
          ffmpegArgs: args,
          duration,
          onProgress: (value) => {
            const fraction = (elapsedBefore + Math.max(0, Math.min(1, value)) * duration) / totalDuration;
            job.status.progress = Math.max(0, Math.min(0.9, fraction * 0.9));
          },
        });
        job.cancelProcess = runner.cancel;
        if (job.cancelled) runner.cancel();
        await runner.result;
        delete job.cancelProcess;
        assertNotCancelled(job);
        job.status.state = 'verifying';
        await verifyOutput(temporary, plan, duration);
        encoded.push({ path: temporary, task });
        job.status.completedSegments = encoded.length;
      }

      let finalOutput: string | undefined;
      if (merged) {
        assertNotCancelled(job);
        job.status.state = 'merging';
        job.status.progress = 0.91;
        const listPath = join(workDir, 'segments.ffcat');
        await writeFile(listPath, buildCropConcatList(encoded.map((item) => item.path)), 'utf8');
        const combinedPath = join(workDir, `merged.${plan.output.format}`);
        const runner = runScopedFfmpeg({
          ffmpegArgs: buildCropConcatArgs({ listPath, outputPath: combinedPath, plan }),
          duration: totalDuration,
          onProgress: (value) => {
            job.status.progress = 0.91 + Math.max(0, Math.min(1, value)) * 0.05;
          },
        });
        job.cancelProcess = runner.cancel;
        if (job.cancelled) runner.cancel();
        await runner.result;
        delete job.cancelProcess;
        assertNotCancelled(job);
        job.status.state = 'verifying';
        job.status.progress = 0.97;
        await verifyOutput(combinedPath, plan, totalDuration);
        assertNotCancelled(job);
        job.status.state = 'committing';
        finalOutput = await commitWithoutOverwrite(combinedPath, plan.outputDir, plan.mergedOutputName!);
        job.status.outputPaths!.push(finalOutput);
      } else {
        job.status.state = 'committing';
        for (const item of encoded) {
          assertNotCancelled(job);
          const outputPath = await commitWithoutOverwrite(item.path, plan.outputDir, item.task.outputName);
          job.status.outputPaths!.push(outputPath);
          finalOutput ??= outputPath;
          job.status.progress = 0.9 + (job.status.outputPaths!.length / encoded.length) * 0.1;
        }
      }
      if (finalOutput == null) throw new Error('Crop export produced no output');
      job.status.outputPath = finalOutput;
      job.status.progress = 1;
      job.status.state = 'success';
    } catch (error) {
      if (job.cancelled) {
        job.status.state = 'cancelled';
      } else {
        job.status.state = 'failed';
        job.status.error = error instanceof Error ? error.message : String(error);
        logger.error('Crop video export failed', error);
      }
    } finally {
      delete job.cancelProcess;
      await rm(workDir, { recursive: true, force: true })
        .catch((error: unknown) => logger.warn('Failed to clean crop export temporary directory', error));
    }
  };
  run().catch((error: unknown) => {
    job.status.state = 'failed';
    job.status.error = error instanceof Error ? error.message : String(error);
    logger.error('Unexpected crop export failure', error);
  });
  return id;
}

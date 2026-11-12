import { randomUUID } from 'node:crypto';
import { basename, join, parse } from 'node:path';
import { link, mkdir, rm, stat, unlink } from 'node:fs/promises';

import type { CropExportPlan } from '../common/videoCropTypes.js';
import { validateCropExportRequest } from '../common/videoCropValidation.js';
import { runFfprobe, runScopedFfmpeg } from './ffmpeg.js';
import { buildCropFfmpegArgs } from './videoCropFfmpegArgs.js';
import logger from './logger.js';

export type CropExportState = 'preparing' | 'encoding' | 'verifying' | 'committing' | 'success' | 'failed' | 'cancelled';

export interface CropExportStatus {
  id: string;
  state: CropExportState;
  progress: number;
  outputPath?: string;
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
  for (const [id] of completed.slice(0, Math.max(0, completed.length - MAX_COMPLETED))) jobs.delete(id);
}

export function getCropExportStatus(id: string): CropExportStatus | undefined {
  const job = jobs.get(id);
  return job == null ? undefined : { ...job.status };
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

async function verifyOutput(path: string, plan: CropExportPlan) {
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
  const expectedDuration = plan.tasks[0]!.end - plan.tasks[0]!.start;
  if (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration - expectedDuration) > Math.max(1, expectedDuration * 0.02)) {
    throw new Error('Crop output duration verification failed');
  }
}

/**
 * Phase 3B deliberately executes only one time range. Multi-segment export
 * and concatenation are reserved for Phase 3C.
 */
export async function startCropExport(plan: CropExportPlan): Promise<string> {
  if (plan.tasks.length !== 1 || plan.mergedOutputName) throw new Error('Multi-segment crop export is not available yet');
  const requestProblems = validateCropExportRequest({
    sourcePath: plan.sourcePath,
    outputDir: plan.outputDir,
    frame: plan.frame,
    videoStreamIndex: plan.videoStreamIndex,
    ...(plan.audioStreamIndex != null && { audioStreamIndex: plan.audioStreamIndex }),
    sourceDuration: Math.max(plan.tasks[0]!.end, 1),
    segments: plan.tasks.map(({ start, end, originalIndex }) => ({ start, end, originalIndex })),
    config: { rect: plan.crop, aspectPreset: 'free', output: plan.output },
  });
  // Entire-video validation uses the original source duration in the planner;
  // the service validates only the immutable plan and local file existence.
  if (requestProblems.some(({ field }) => field !== 'segments')) throw new Error('Invalid crop export plan');
  const source = await stat(plan.sourcePath);
  if (!source.isFile()) throw new Error('Crop source must be a local file');

  await mkdir(plan.outputDir, { recursive: true });
  const id = randomUUID();
  const job: CropJob = { status: { id, state: 'preparing', progress: 0 }, cancelled: false };
  pruneJobs();
  jobs.set(id, job);
  const run = async () => {
    const workDir = join(plan.outputDir, '.swiftcut-crop-tmp', id);
    const temporary = join(workDir, `output.${plan.output.format}`);
    try {
      assertNotCancelled(job);
      await mkdir(workDir, { recursive: true });
      assertNotCancelled(job);
      job.status.state = 'encoding';
      const args = buildCropFfmpegArgs({ plan, task: plan.tasks[0]!, outputPath: temporary });
      const runner = runScopedFfmpeg({
        ffmpegArgs: args,
        duration: plan.tasks[0]!.end - plan.tasks[0]!.start,
        onProgress: (progress) => {
          job.status.progress = Math.max(0, Math.min(0.9, progress * 0.9));
        },
      });
      job.cancelProcess = runner.cancel;
      if (job.cancelled) runner.cancel();
      await runner.result;
      delete job.cancelProcess;
      assertNotCancelled(job);
      job.status.state = 'verifying';
      job.status.progress = 0.92;
      await verifyOutput(temporary, plan);
      assertNotCancelled(job);
      job.status.state = 'committing';
      job.status.progress = 0.98;
      const outputPath = await commitWithoutOverwrite(temporary, plan.outputDir, plan.tasks[0]!.outputName);
      job.status.outputPath = outputPath;
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
      await rm(workDir, { recursive: true, force: true }).catch((error: unknown) => logger.warn('Failed to clean crop export temporary directory', error));
    }
  };
  run().catch((error: unknown) => {
    job.status.state = 'failed';
    job.status.error = error instanceof Error ? error.message : String(error);
    logger.error('Unexpected crop export failure', error);
  });
  return id;
}

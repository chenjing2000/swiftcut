// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CropExportPlan } from '../common/videoCropTypes.js';
import { cancelCropExport, getCropExportStatus, startCropExport } from './videoCropExportService.js';

type FfprobeMock = (args: readonly string[]) => Promise<{ stdout: Buffer }>;
type FfmpegMock = (args: {
  ffmpegArgs: string[];
  duration?: number;
  onProgress: (progress: number) => void;
}) => { result: Promise<unknown>; cancel: () => void };
type LoggerMock = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  probe: vi.fn<FfprobeMock>(),
  run: vi.fn<FfmpegMock>(),
  logger: { error: vi.fn<LoggerMock>(), warn: vi.fn<LoggerMock>(), info: vi.fn<LoggerMock>() },
}));

vi.mock('./ffmpeg.js', () => ({
  runFfprobe: mocks.probe,
  runScopedFfmpeg: mocks.run,
}));

vi.mock('./logger.js', () => ({ default: mocks.logger }));

let directory: string;
let source: string;

const makePlan = (): CropExportPlan => ({
  sourcePath: source,
  outputDir: directory,
  frame: { width: 320, height: 240, rotation: 0, sarNum: 1, sarDen: 1 },
  videoStreamIndex: 0,
  audioStreamIndex: 1,
  crop: { x: 10, y: 10, width: 100, height: 100 },
  output: {
    resize: false,
    width: 100,
    height: 100,
    lockAspect: true,
    quality: 'high',
    encoder: 'libx264',
    crf: 18,
    preset: 'medium',
    pixelFormat: 'yuv420p',
    format: 'mp4',
    keepAudio: true,
    timeRange: 'selected',
    outputMode: 'merge',
  },
  outputWidth: 100,
  outputHeight: 100,
  encodedWidth: 100,
  encodedHeight: 100,
  outputSarNum: 1,
  outputSarDen: 1,
  tasks: [{ start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop.mp4' }],
});

async function expectState(id: string, state: string) {
  await vi.waitFor(() => expect(getCropExportStatus(id)?.state).toBe(state));
}

describe('Crop Video single-segment service', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'swiftcut-crop-service-'));
    source = join(directory, 'clip.mp4');
    await writeFile(source, 'mock video source');
    vi.clearAllMocks();
    mocks.probe.mockImplementation(async () => ({
      stdout: Buffer.from(JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 100, height: 100 },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '2' },
      })),
    }));
    mocks.run.mockImplementation(({ ffmpegArgs, onProgress }) => {
      writeFileSync(ffmpegArgs.at(-1)!, 'mock encoded video');
      onProgress(0.5);
      return { result: Promise.resolve(undefined), cancel: () => undefined };
    });
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('validates and commits a single encoded file without leaving task files', async () => {
    const jobId = await startCropExport(makePlan());
    await expectState(jobId, 'success');
    const status = getCropExportStatus(jobId)!;
    expect(status.progress).toBe(1);
    expect(status.outputPath).toBe(join(directory, 'clip.crop.mp4'));
    await expect(readFile(status.outputPath!)).resolves.toStrictEqual(Buffer.from('mock encoded video'));
    await expect(readdir(join(directory, '.swiftcut-crop-tmp'))).resolves.toStrictEqual([]);
  });

  it('never overwrites a pre-existing output file', async () => {
    await writeFile(join(directory, 'clip.crop.mp4'), 'original');
    const jobId = await startCropExport(makePlan());
    await expectState(jobId, 'success');
    await expect(readFile(join(directory, 'clip.crop.mp4'), 'utf8')).resolves.toBe('original');
    expect(getCropExportStatus(jobId)?.outputPath).toBe(join(directory, 'clip.crop_1.mp4'));
  });

  it('reports cancellation and does not commit a partial output', async () => {
    mocks.run.mockImplementation(({ ffmpegArgs }) => {
      writeFileSync(ffmpegArgs.at(-1)!, 'partial');
      const { promise, reject } = Promise.withResolvers<unknown>();
      return { result: promise, cancel: () => reject(new Error('aborted')) };
    });
    const jobId = await startCropExport(makePlan());
    await vi.waitFor(() => expect(getCropExportStatus(jobId)?.state).toBe('encoding'));
    cancelCropExport(jobId);
    await expectState(jobId, 'cancelled');
    expect(getCropExportStatus(jobId)?.outputPath).toBeUndefined();
    await expect(readdir(directory)).resolves.not.toContain('clip.crop.mp4');
  });

  it('exports two selected segments separately with deterministic filenames', async () => {
    const plan = makePlan();
    plan.output.outputMode = 'separate';
    plan.tasks = [
      { start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop-001.mp4' },
      { start: 5, end: 7, originalIndex: 1, outputName: 'clip.crop-002.mp4' },
    ];
    const jobId = await startCropExport(plan);
    await expectState(jobId, 'success');
    const status = getCropExportStatus(jobId)!;
    expect(status.completedSegments).toBe(2);
    expect(status.outputPaths).toStrictEqual([
      join(directory, 'clip.crop-001.mp4'),
      join(directory, 'clip.crop-002.mp4'),
    ]);
    expect(mocks.run).toHaveBeenCalledTimes(2);
  });

  it('joins two encoded segments using stream copy and verifies combined duration', async () => {
    const plan = makePlan();
    plan.mergedOutputName = 'clip.crop.mp4';
    plan.tasks = [
      { start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop.mp4' },
      { start: 5, end: 7, originalIndex: 1, outputName: 'clip.crop.mp4' },
    ];
    mocks.probe.mockImplementation(async (args) => ({
      stdout: Buffer.from(JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 100, height: 100 },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: args.at(-1)?.includes('merged.') ? '4' : '2' },
      })),
    }));
    const jobId = await startCropExport(plan);
    await expectState(jobId, 'success');
    expect(mocks.run).toHaveBeenCalledTimes(3);
    const args = mocks.run.mock.calls[2]![0].ffmpegArgs;
    expect(args).toContain('concat');
    expect(args).toContain('copy');
    expect(getCropExportStatus(jobId)?.outputPaths).toStrictEqual([join(directory, 'clip.crop.mp4')]);
  });

  it('cancels a running concatenation before any final file is committed', async () => {
    const plan = makePlan();
    plan.mergedOutputName = 'clip.crop.mp4';
    plan.tasks = [
      { start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop.mp4' },
      { start: 5, end: 7, originalIndex: 1, outputName: 'clip.crop.mp4' },
    ];
    mocks.run.mockImplementation(({ ffmpegArgs }) => {
      writeFileSync(ffmpegArgs.at(-1)!, 'partial output');
      if (mocks.run.mock.calls.length <= 2) {
        return { result: Promise.resolve(undefined), cancel: () => undefined };
      }
      const { promise, reject } = Promise.withResolvers<unknown>();
      return { result: promise, cancel: () => reject(new Error('cancelled merge')) };
    });
    const jobId = await startCropExport(plan);
    await vi.waitFor(() => expect(getCropExportStatus(jobId)?.state).toBe('merging'));
    cancelCropExport(jobId);
    await expectState(jobId, 'cancelled');
    expect(getCropExportStatus(jobId)?.outputPaths).toStrictEqual([]);
    await expect(readdir(directory)).resolves.not.toContain('clip.crop.mp4');
  });

  it('rejects overlapping merge segments before creating a job', async () => {
    const plan = makePlan();
    plan.tasks = [
      { start: 1, end: 4, originalIndex: 0, outputName: 'clip.crop.mp4' },
      { start: 3, end: 5, originalIndex: 1, outputName: 'clip.crop.mp4' },
    ];
    await expect(startCropExport(plan)).rejects.toThrow('Overlapping crop segments');
  });

  it('cancels the second segment and does not commit incomplete batch outputs', async () => {
    const plan = makePlan();
    plan.output.outputMode = 'separate';
    plan.tasks = [
      { start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop-001.mp4' },
      { start: 5, end: 7, originalIndex: 1, outputName: 'clip.crop-002.mp4' },
    ];
    mocks.run.mockImplementation(({ ffmpegArgs }) => {
      writeFileSync(ffmpegArgs.at(-1)!, 'partial data');
      if (mocks.run.mock.calls.length === 1) {
        return { result: Promise.resolve(undefined), cancel: () => undefined };
      }
      const { promise, reject } = Promise.withResolvers<unknown>();
      return { result: promise, cancel: () => reject(new Error('cancelled')) };
    });
    const jobId = await startCropExport(plan);
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(2));
    cancelCropExport(jobId);
    await expectState(jobId, 'cancelled');
    await expect(readdir(directory)).resolves.not.toContain('clip.crop-001.mp4');
    await expect(readdir(directory)).resolves.not.toContain('clip.crop-002.mp4');
  });

  it('preserves completed files and reports partial success if a later commit fails', async () => {
    const plan = makePlan();
    plan.output.outputMode = 'separate';
    plan.tasks = [
      { start: 1, end: 3, originalIndex: 0, outputName: 'clip.crop-001.mp4' },
      { start: 5, end: 7, originalIndex: 1, outputName: '../invalid.mp4' },
    ];
    const jobId = await startCropExport(plan);
    await expectState(jobId, 'partial_success');
    const result = getCropExportStatus(jobId)!;
    expect(result.interruption).toBe('failed');
    expect(result.error).toContain('Invalid crop output filename');
    expect(result.outputPaths).toStrictEqual([join(directory, 'clip.crop-001.mp4')]);
    await expect(readFile(result.outputPaths![0]!)).resolves.toStrictEqual(Buffer.from('mock encoded video'));
    await expect(readdir(join(directory, '.swiftcut-crop-tmp'))).resolves.toStrictEqual([]);
  });

  it('does not publish a terminal state while temporary files are still present', async () => {
    const jobId = await startCropExport(makePlan());
    await expectState(jobId, 'success');
    await expect(readdir(join(directory, '.swiftcut-crop-tmp'))).resolves.toStrictEqual([]);
  });

  it('rejects output that would be double-rotated by the video player', async () => {
    mocks.probe.mockImplementation(async () => ({
      stdout: Buffer.from(JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 100, height: 100,
            side_data_list: [{ rotation: 90 }] },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '2' },
      })),
    }));
    const jobId = await startCropExport(makePlan());
    await expectState(jobId, 'failed');
    expect(getCropExportStatus(jobId)?.error).toContain('unexpected display rotation metadata');
    await expect(readdir(directory)).resolves.not.toContain('clip.crop.mp4');
  });

  it('fails verification and never commits an invalid output', async () => {
    mocks.probe.mockImplementation(async () => ({
      stdout: Buffer.from(JSON.stringify({
        streams: [{ codec_type: 'video', codec_name: 'h264', width: 10, height: 10 }],
        format: { duration: '2' },
      })),
    }));
    const jobId = await startCropExport(makePlan());
    await expectState(jobId, 'failed');
    expect(getCropExportStatus(jobId)?.error).toContain('verification failed');
    await expect(readdir(directory)).resolves.not.toContain('clip.crop.mp4');
  });
});

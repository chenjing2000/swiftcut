// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  cancelAudioExtraction,
  getAudioExtractionStatus,
  startAudioExtraction,
} from './audioExtraction.js';

type FfprobeMock = (args: readonly string[]) => Promise<{ stdout: Buffer }>;
type ScopedFfmpegMock = (options: {
  ffmpegArgs: string[];
  duration?: number;
  onProgress: (progress: number) => void;
}) => { result: Promise<unknown>; cancel: () => void };
type LoggerMock = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  runFfprobe: vi.fn<FfprobeMock>(),
  runScopedFfmpeg: vi.fn<ScopedFfmpegMock>(),
  logger: {
    error: vi.fn<LoggerMock>(),
    warn: vi.fn<LoggerMock>(),
    info: vi.fn<LoggerMock>(),
  },
}));

vi.mock('./ffmpeg.js', () => ({
  runFfprobe: mocks.runFfprobe,
  runScopedFfmpeg: mocks.runScopedFfmpeg,
}));

vi.mock('./logger.js', () => ({
  default: mocks.logger,
}));

let testDirectory: string;
let inputPath: string;

const waitForJob = async (id: string, expectedState: string) => {
  await vi.waitFor(() => {
    expect(getAudioExtractionStatus(id)?.state).toBe(expectedState);
  });
};

describe('Audio extraction task service', () => {
  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'swiftcut-audio-extraction-'));
    inputPath = join(testDirectory, 'lecture.mp4');
    await writeFile(inputPath, 'mock MP4 input');

    vi.clearAllMocks();
    mocks.runFfprobe.mockImplementation(async (args) => {
      const targetPath = args.at(-1) ?? '';
      const isInput = targetPath.toLowerCase().endsWith('.mp4');
      const outputExtension = targetPath.split('.').at(-1)?.toLowerCase() ?? 'mp3';
      const outputCodecByExtension: Record<string, string> = {
        m4a: 'aac',
        mp3: 'mp3',
        ac3: 'ac3',
        eac3: 'eac3',
        opus: 'opus',
        mka: 'vorbis',
      };
      const result = isInput
        ? {
          format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12' },
          streams: [
            { index: 0, codec_type: 'video', codec_name: 'h264' },
            { index: 1, codec_type: 'audio', codec_name: 'aac' },
            { index: 2, codec_type: 'audio', codec_name: 'ac3' },
          ],
        }
        : {
          format: { format_name: outputExtension, duration: '2' },
          streams: [{ index: 0, codec_type: 'audio', codec_name: outputCodecByExtension[outputExtension] ?? 'mp3' }],
        };
      return { stdout: Buffer.from(JSON.stringify(result), 'utf8') };
    });

    mocks.runScopedFfmpeg.mockImplementation(({ ffmpegArgs, onProgress }) => {
      const outputPath = ffmpegArgs.at(-1)!;
      writeFileSync(outputPath, Buffer.from('mock MP3 data'));
      onProgress(0.6);
      return { result: Promise.resolve({}), cancel: vi.fn<() => void>() };
    });
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  test('extracts every selected track from every selected segment', async () => {
    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: 'vbr',
      segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }],
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;

    expect(status.totalTasks).toBe(4);
    expect(status.completedTasks).toBe(4);
    expect(status.progress).toBe(1);
    expect(status.outputPaths).toHaveLength(4);
    expect(status.tasks.every((task) => task.state === 'success')).toBe(true);
    expect(status.outputPaths.map((path) => path.split(/[\\/]/u).at(-1))).toStrictEqual([
      'lecture_segment-01_track-01.mp3',
      'lecture_segment-01_track-02.mp3',
      'lecture_segment-02_track-01.mp3',
      'lecture_segment-02_track-02.mp3',
    ]);

    const ffmpegCalls = mocks.runScopedFfmpeg.mock.calls;
    expect(ffmpegCalls).toHaveLength(4);
    expect(ffmpegCalls[0]![0].ffmpegArgs).toContain('0:1');
    expect(ffmpegCalls[1]![0].ffmpegArgs).toContain('0:2');
    expect(ffmpegCalls[0]![0].ffmpegArgs).toContain('1');
    expect(ffmpegCalls[2]![0].ffmpegArgs).toContain('5');
    for (const outputPath of status.outputPaths) {
      await expect(readFile(outputPath)).resolves.toStrictEqual(Buffer.from('mock MP3 data'));
    }
  });


  test('extracts selected original tracks into codec-specific containers for every segment', async () => {
    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      mode: 'original',
      quality: 'vbr',
      segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }],
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;

    expect(status.totalTasks).toBe(4);
    expect(status.outputPaths.map((path) => path.split(/[\\/]/u).at(-1))).toStrictEqual([
      'lecture_segment-01_track-01.m4a',
      'lecture_segment-01_track-02.ac3',
      'lecture_segment-02_track-01.m4a',
      'lecture_segment-02_track-02.ac3',
    ]);

    const ffmpegCalls = mocks.runScopedFfmpeg.mock.calls;
    expect(ffmpegCalls).toHaveLength(4);
    for (const [index, call] of ffmpegCalls.entries()) {
      expect(call[0].ffmpegArgs).toContain('-c:a');
      expect(call[0].ffmpegArgs).toContain('copy');
      expect(call[0].ffmpegArgs).not.toContain('libmp3lame');
      expect(call[0].ffmpegArgs).not.toContain('-b:a');
      expect(call[0].ffmpegArgs).not.toContain('-q:a');
      expect(call[0].ffmpegArgs.at(-1)).toMatch(index % 2 === 0 ? /\.m4a$/u : /\.ac3$/u);
    }
    expect(ffmpegCalls[0]![0].ffmpegArgs).toContain('ipod');
    expect(ffmpegCalls[1]![0].ffmpegArgs).toContain('ac3');
    for (const outputPath of status.outputPaths) {
      await expect(readFile(outputPath)).resolves.toStrictEqual(Buffer.from('mock MP3 data'));
    }
  });

  test('uses Matroska Audio as the fallback container for other original codecs', async () => {
    mocks.runFfprobe.mockImplementationOnce(async () => ({
      stdout: Buffer.from(JSON.stringify({
        format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12' },
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'h264' },
          { index: 1, codec_type: 'audio', codec_name: 'vorbis' },
        ],
      }), 'utf8'),
    }));

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1],
      mode: 'original',
      quality: 'vbr',
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;
    expect(status.outputPaths).toStrictEqual([join(testDirectory, 'lecture.mka')]);
    expect(mocks.runScopedFfmpeg.mock.calls[0]![0].ffmpegArgs).toContain('matroska');
  });

  test('does not overwrite an existing Original-mode output file', async () => {
    const existingPath = join(testDirectory, 'lecture.m4a');
    await writeFile(existingPath, 'keep original content');

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1],
      mode: 'original',
      quality: 'vbr',
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;
    expect(status.outputPaths[0]).toBe(join(testDirectory, 'lecture_1.m4a'));
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('keep original content');
  });

  test('removes the Original-mode temporary file when cancelled', async () => {
    const currentTask = Promise.withResolvers<unknown>();
    const cancel = vi.fn<() => void>(() => currentTask.reject(new Error('mock cancellation')));
    mocks.runScopedFfmpeg.mockImplementation(({ ffmpegArgs }) => {
      writeFileSync(ffmpegArgs.at(-1)!, Buffer.from('partial original audio data'));
      return { result: currentTask.promise, cancel };
    });

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1],
      mode: 'original',
      quality: 'vbr',
    });

    await vi.waitFor(() => expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(1));
    cancelAudioExtraction(id);
    await waitForJob(id, 'cancelled');

    const files = await readdir(testDirectory);
    expect(files.some((file) => file.endsWith('.tmp.m4a'))).toBe(false);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  test('does not overwrite an existing output file', async () => {
    const existingPath = join(testDirectory, 'lecture.mp3');
    await writeFile(existingPath, 'keep existing content');

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1],
      quality: '192k',
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;

    expect(status.outputPaths[0]).toBe(join(testDirectory, 'lecture_1.mp3'));
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('keep existing content');
  });

  test('continues remaining tasks after one track fails', async () => {
    const failedResult = Promise.reject(new Error('mock encoder failure'));
    // Mark the rejection as handled immediately; the service still observes the
    // original rejection when it awaits this promise.
    await failedResult.catch(() => undefined);

    mocks.runScopedFfmpeg.mockReturnValueOnce({
      result: failedResult,
      cancel: vi.fn<() => void>(),
    });

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: '320k',
    });

    await waitForJob(id, 'failed');
    const status = getAudioExtractionStatus(id)!;

    expect(status.tasks.map((task) => task.state)).toStrictEqual(['failed', 'success']);
    expect(status.outputPaths).toHaveLength(1);
    expect(status.tasks[0]!.error).toContain('mock encoder failure');
  });

  test('cancels the active FFmpeg task and removes its temporary output', async () => {
    const currentTask = Promise.withResolvers<unknown>();
    const cancel = vi.fn<() => void>(() => currentTask.reject(new Error('mock cancellation')));
    mocks.runScopedFfmpeg.mockImplementation(({ ffmpegArgs }) => {
      writeFileSync(ffmpegArgs.at(-1)!, Buffer.from('partial MP3 data'));
      return { result: currentTask.promise, cancel };
    });

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: 'vbr',
      segments: [{ start: 0, end: 4 }, { start: 4, end: 8 }],
    });

    await vi.waitFor(() => expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(1));
    cancelAudioExtraction(id);
    await waitForJob(id, 'cancelled');

    const status = getAudioExtractionStatus(id)!;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(status.tasks.map((task) => task.state)).toStrictEqual([
      'cancelled',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(status.tasks[0]!.error).toBeUndefined();
    expect(status.tasks.slice(1).every((task) => task.error === undefined)).toBe(true);
    expect(status.error).toBeUndefined();
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(1);
    const files = await readdir(testDirectory);
    expect(files.some((file) => file.endsWith('.tmp.mp3'))).toBe(false);
  });

  test('preserves completed MP3 files and skips unstarted tasks after partial cancellation', async () => {
    const secondTask = Promise.withResolvers<unknown>();
    const cancelSecondTask = vi.fn<() => void>(() => secondTask.reject(new Error('mock cancellation')));
    let callCount = 0;

    mocks.runScopedFfmpeg.mockImplementation(({ ffmpegArgs }) => {
      callCount += 1;
      writeFileSync(ffmpegArgs.at(-1)!, Buffer.from(`mock MP3 data ${callCount}`));
      if (callCount === 2) {
        return { result: secondTask.promise, cancel: cancelSecondTask };
      }
      return { result: Promise.resolve({}), cancel: vi.fn<() => void>() };
    });

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: 'vbr',
      segments: [{ start: 0, end: 4 }, { start: 4, end: 8 }],
    });

    await vi.waitFor(() => expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(2));
    const firstOutputPath = join(testDirectory, 'lecture_segment-01_track-01.mp3');
    await expect(readFile(firstOutputPath, 'utf8')).resolves.toBe('mock MP3 data 1');

    cancelAudioExtraction(id);
    await waitForJob(id, 'cancelled');

    const status = getAudioExtractionStatus(id)!;
    expect(status.tasks.map((task) => task.state)).toStrictEqual([
      'success',
      'cancelled',
      'skipped',
      'skipped',
    ]);
    expect(status.tasks[1]!.error).toBeUndefined();
    expect(status.tasks.slice(2).every((task) => task.error === undefined)).toBe(true);
    expect(status.error).toBeUndefined();
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(status.outputPaths).toStrictEqual([firstOutputPath]);
    await expect(readFile(firstOutputPath, 'utf8')).resolves.toBe('mock MP3 data 1');
    expect(cancelSecondTask).toHaveBeenCalledTimes(1);
    expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(2);

    const files = await readdir(testDirectory);
    expect(files.some((file) => file.endsWith('.tmp.mp3'))).toBe(false);
  });


  test('runs FFmpeg tasks serially rather than concurrently', async () => {
    const firstTask = Promise.withResolvers<unknown>();
    let callCount = 0;
    mocks.runScopedFfmpeg.mockImplementation(({ ffmpegArgs }) => {
      callCount += 1;
      writeFileSync(ffmpegArgs.at(-1)!, Buffer.from('mock MP3 data'));
      if (callCount === 1) {
        return { result: firstTask.promise, cancel: vi.fn<() => void>() };
      }
      return { result: Promise.resolve({}), cancel: vi.fn<() => void>() };
    });

    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: 'vbr',
    });

    await vi.waitFor(() => expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(1));
    expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(1);
    firstTask.resolve({});
    await waitForJob(id, 'success');
    expect(mocks.runScopedFfmpeg).toHaveBeenCalledTimes(2);
  });

  test('uses the whole media duration when no timeline segments are selected', async () => {
    const id = await startAudioExtraction({
      inputPath,
      streamIndexes: [1, 2],
      quality: 'vbr',
    });

    await waitForJob(id, 'success');
    const status = getAudioExtractionStatus(id)!;
    expect(status.totalTasks).toBe(2);
    expect(status.outputPaths.map((path) => path.split(/[\\/]/u).at(-1))).toStrictEqual([
      'lecture_track-01.mp3',
      'lecture_track-02.mp3',
    ]);
    expect(mocks.runScopedFfmpeg.mock.calls[0]![0].ffmpegArgs).toContain('12');
    expect(mocks.runScopedFfmpeg.mock.calls[0]![0].ffmpegArgs).not.toContain('-ss');
  });

  test('rejects a selected stream that is not an audio stream', async () => {
    await expect(startAudioExtraction({
      inputPath,
      streamIndexes: [0],
      quality: 'vbr',
    })).rejects.toThrow('is not an audio track');
  });

  test('rejects a non-MP4 input before starting FFmpeg', async () => {
    const wrongInput = join(testDirectory, 'lecture.mov');
    await writeFile(wrongInput, 'not an MP4 extension');

    await expect(startAudioExtraction({
      inputPath: wrongInput,
      streamIndexes: [1],
      quality: 'vbr',
    })).rejects.toThrow('Only local MP4 files are supported');
    expect(mocks.runScopedFfmpeg).not.toHaveBeenCalled();
  });
});

// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CropExportPlan } from '../common/videoCropTypes.js';
import { buildCropFfmpegArgs } from './videoCropFfmpegArgs.js';

const enabled = process.env['SWIFTCUT_CROP_FFMPEG_TEST'] === '1';

interface ProbeStream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

function probe(path: string): { streams: ProbeStream[]; format: { duration: string } } {
  const stdout = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,sample_aspect_ratio,avg_frame_rate,r_frame_rate',
    '-of', 'json', path,
  ]);
  return JSON.parse(stdout.toString('utf8')) as { streams: ProbeStream[]; format: { duration: string } };
}

function runFfmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 60_000 });
}

function planFor(input: string, dir: string): CropExportPlan {
  return {
    sourcePath: input,
    outputDir: dir,
    frame: { width: 160, height: 120, rotation: 0, sarNum: 1, sarDen: 1 },
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    crop: { x: 11, y: 9, width: 81, height: 71 },
    output: {
      resize: false,
      width: 81,
      height: 71,
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
    outputWidth: 81,
    outputHeight: 71,
    encodedWidth: 82,
    encodedHeight: 72,
    outputSarNum: 1,
    outputSarDen: 1,
    tasks: [{ start: 0.2, end: 1.2, originalIndex: 0, outputName: 'crop.mp4' }],
  };
}

function exportCrop(plan: CropExportPlan, path: string) {
  runFfmpeg(buildCropFfmpegArgs({ plan, task: plan.tasks[0]!, outputPath: path }));
  // Confirm the result actually decodes to completion, beyond metadata checks.
  runFfmpeg(['-xerror', '-i', path, '-f', 'null', '-']);
  return probe(path);
}

describe.skipIf(!enabled)('Crop Video compatibility with real FFmpeg', () => {
  it('preserves non-square pixel aspect ratio when cropping without resizing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crop-sar-'));
    try {
      const source = join(dir, 'source.mkv');
      runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-vf', 'setsar=4/3', '-c:v', 'mpeg4', '-y', source]);
      const plan = planFor(source, dir);
      delete plan.audioStreamIndex;
      plan.frame.sarNum = 4;
      plan.frame.sarDen = 3;
      plan.outputSarNum = 4;
      plan.outputSarDen = 3;
      const meta = exportCrop(plan, join(dir, 'crop.mp4'));
      const video = meta.streams.find((stream) => stream.codec_type === 'video');
      expect(video).toMatchObject({ codec_name: 'h264', width: 82, height: 72, sample_aspect_ratio: '4:3' });
      expect(meta.streams.some((stream) => stream.codec_type === 'audio')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([90, 270] as const)('applies source orientation %i to portrait output and inverses SAR', (rotation) => {
    const dir = mkdtempSync(join(tmpdir(), 'crop-orientation-'));
    try {
      const source = join(dir, 'landscape.mkv');
      runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-vf', 'setsar=4/3', '-c:v', 'mpeg4', '-y', source]);
      const plan = planFor(source, dir);
      delete plan.audioStreamIndex;
      plan.frame.sarNum = 4;
      plan.frame.sarDen = 3;
      plan.frame.rotation = rotation;
      plan.crop = { x: 9, y: 11, width: 71, height: 81 };
      plan.outputWidth = 71;
      plan.outputHeight = 81;
      plan.encodedWidth = 72;
      plan.encodedHeight = 82;
      plan.outputSarNum = 3;
      plan.outputSarDen = 4;
      const meta = exportCrop(plan, join(dir, 'portrait.mp4'));
      const video = meta.streams.find((stream) => stream.codec_type === 'video');
      expect(video).toMatchObject({ width: 72, height: 82, sample_aspect_ratio: '3:4' });
      expect(video?.codec_name).toBe('h264');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('transcodes a non-AAC audio source to AAC while cropping', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crop-audio-'));
    try {
      const source = join(dir, 'pcm.mkv');
      runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=750:sample_rate=48000:duration=2',
        '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-y', source]);
      expect(probe(source).streams.some((stream) => stream.codec_name === 'pcm_s16le')).toBe(true);
      const plan = planFor(source, dir);
      const meta = exportCrop(plan, join(dir, 'crop.mp4'));
      expect(meta.streams.some((stream) => stream.codec_name === 'aac')).toBe(true);
      expect(Number(meta.format.duration)).toBeGreaterThan(0.95);
      expect(Number(meta.format.duration)).toBeLessThan(1.15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a variable-frame-rate input without forcing constant output frame rate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crop-vfr-'));
    try {
      const source = join(dir, 'vfr.mkv');
      // Insert a regular time gap every four frames: the resulting PTS spacing
      // alternates between 1/30 and 2/30 of a second (genuine VFR).
      runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=30:duration=3',
        '-vf', 'setpts=(N+floor(N/4))/(30*TB)', '-fps_mode', 'vfr',
        '-c:v', 'mpeg4', '-y', source]);
      const frameTimes = execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time',
        '-of', 'csv=p=0', source,
      ]).toString('utf8').trim().split(/\\r?\\n/).map(Number).filter(Number.isFinite);
      const intervals = frameTimes.slice(1).map((time, i) => Math.round((time - frameTimes[i]!) * 1000));
      expect(new Set(intervals).size).toBeGreaterThan(1);
      const plan = planFor(source, dir);
      delete plan.audioStreamIndex;
      plan.tasks = [{ start: 0.2, end: 1.2, originalIndex: 0, outputName: 'crop.mkv' }];
      plan.output.format = 'mkv';
      const meta = exportCrop(plan, join(dir, 'crop.mkv'));
      expect(meta.streams.some((stream) => stream.codec_name === 'h264')).toBe(true);
      expect(Number(meta.format.duration)).toBeGreaterThan(0.85);
      expect(Number(meta.format.duration)).toBeLessThan(1.3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

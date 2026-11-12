// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CropExportPlan } from '../common/videoCropTypes.js';
import { buildCropFfmpegArgs } from './videoCropFfmpegArgs.js';

const enabled = process.env['SWIFTCUT_CROP_FFMPEG_TEST'] === '1';

describe.skipIf(!enabled)('Crop Video real FFmpeg smoke test', () => {
  it('accurately encodes an odd-coordinate video crop with audio and compatible padding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swiftcut-crop-test-'));
    try {
      const input = join(dir, 'source.mp4');
      const output = join(dir, 'cropped.mp4');
      execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
        '-i', 'testsrc2=size=320x240:rate=30', '-f', 'lavfi',
        '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2',
        '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'aac', '-y', input,
      ]);
      const plan: CropExportPlan = {
        sourcePath: input,
        outputDir: dir,
        frame: { width: 320, height: 240, rotation: 0, sarNum: 1, sarDen: 1 },
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        crop: { x: 21, y: 17, width: 101, height: 99 },
        output: {
          resize: false,
          width: 101,
          height: 99,
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
        outputWidth: 101,
        outputHeight: 99,
        encodedWidth: 102,
        encodedHeight: 100,
        outputSarNum: 1,
        outputSarDen: 1,
        tasks: [{ start: 0.5, end: 1.5, originalIndex: 0, outputName: 'cropped.mp4' }],
      };
      execFileSync('ffmpeg', [
        '-loglevel', 'error',
        ...buildCropFfmpegArgs({ plan, task: plan.tasks[0]!, outputPath: output }),
      ]);
      const probe = execFileSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
        '-of', 'json', output,
      ]);
      const parsed = JSON.parse(probe.toString('utf8')) as {
        streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
        format: { duration: string };
      };
      expect(parsed.streams).toContainEqual({
        codec_type: 'video',
        codec_name: 'h264',
        width: 102,
        height: 100,
      });
      expect(parsed.streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')).toBe(true);
      expect(Number(parsed.format.duration)).toBeCloseTo(1, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

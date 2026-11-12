import { describe, expect, it } from 'vitest';
import type { CropExportPlan } from '../common/videoCropTypes.js';
import { buildCropFfmpegArgs } from './videoCropFfmpegArgs.js';

const makePlan = (): CropExportPlan => ({
  sourcePath: 'C:\\Videos\\source.mp4',
  outputDir: 'C:\\Exports',
  frame: { width: 1920, height: 1080, rotation: 0, sarNum: 1, sarDen: 1 },
  videoStreamIndex: 0, audioStreamIndex: 1,
  crop: { x: 101, y: 51, width: 853, height: 479 },
  output: {
    resize: false, width: 853, height: 479, lockAspect: true,
    quality: 'high', encoder: 'libx264', crf: 18, preset: 'medium', pixelFormat: 'yuv420p',
    format: 'mp4', keepAudio: true, timeRange: 'selected', outputMode: 'merge',
  },
  outputWidth: 853, outputHeight: 479, encodedWidth: 854, encodedHeight: 480,
  outputSarNum: 1, outputSarDen: 1,
  tasks: [{ start: 10, end: 20, originalIndex: 0, outputName: 'source.crop.mp4' }],
});

function getArgs(plan: CropExportPlan) {
  return buildCropFfmpegArgs({ plan, task: plan.tasks[0]!, outputPath: 'C:\\Exports\\temp.mp4' });
}

describe('Crop Video FFmpeg args', () => {
  it('uses explicit stream maps, time range, safe array arguments and exact pixel crop', () => {
    const args = getArgs(makePlan());
    expect(args.slice(args.indexOf('-noautorotate'), args.indexOf('-noautorotate') + 3))
      .toStrictEqual(['-noautorotate', '-i', 'C:\\Videos\\source.mp4']);
    expect(args).toContain('0:0');
    expect(args).toContain('0:1');
    expect(args[args.indexOf('-ss') + 1]).toBe('10.000000');
    expect(args[args.indexOf('-t') + 1]).toBe('10.000000');
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('format=yuv444p,crop=w=853:h=479:x=101:y=51:exact=1');
    expect(vf).toContain('pad=w=854:h=480:x=0:y=0:color=black');
    expect(vf).toContain('format=yuv420p');
    expect(args).toContain('192k');
    expect(args.at(-1)).toBe('C:\\Exports\\temp.mp4');
  });

  it('adds scaling and uses square pixels for resize', () => {
    const plan = makePlan();
    plan.output.resize = true;
    plan.outputWidth = 1280;
    plan.outputHeight = 720;
    plan.encodedWidth = 1280;
    plan.encodedHeight = 720;
    const args = getArgs(plan);
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('scale=w=1280:h=720:flags=lanczos');
    expect(vf).not.toContain('pad=');
  });

  it('disables audio when unchecked or when there is no source audio', () => {
    const plan = makePlan();
    plan.output.keepAudio = false;
    const args = getArgs(plan);
    expect(args).toContain('-an');
    expect(args).not.toContain('0:1');
    plan.output.keepAudio = true;
    delete plan.audioStreamIndex;
    expect(getArgs(plan)).toContain('-an');
  });

  it('handles source display orientation without exposing user rotation controls', () => {
    const plan = makePlan();
    plan.frame = { width: 1080, height: 1920, rotation: 90, sarNum: 1, sarDen: 1 };
    const args = getArgs(plan);
    expect(args[args.indexOf('-vf') + 1]).toContain('format=yuv444p,transpose=clock,crop=');
    plan.frame.rotation = 180;
    expect(getArgs(plan)[args.indexOf('-vf') + 1]).toContain('hflip,vflip');
    plan.frame.rotation = 270;
    expect(getArgs(plan)[args.indexOf('-vf') + 1]).toContain('transpose=cclock');
  });

  it('rejects task mismatch and output path omission', () => {
    const plan = makePlan();
    expect(() => buildCropFfmpegArgs({ plan, task: plan.tasks[0]!, outputPath: '' })).toThrow();
    expect(() => buildCropFfmpegArgs({
      plan,
      task: { start: 200, end: 210, originalIndex: 9, outputName: 'x.mp4' },
      outputPath: 'x.mp4',
    })).toThrow('Unknown crop task');
  });
});

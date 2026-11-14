// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import type { CropExportRequest } from '../../common/videoCropTypes.js';
import { createCropExportPlan } from './videoCropExportPlanner.js';

const makeRequest = (): CropExportRequest => ({
  sourcePath: String.raw`C:\Videos\test.clip.mp4`,
  outputDir: String.raw`C:\Exports`,
  frame: { width: 1920, height: 1080, rotation: 0, sarNum: 1, sarDen: 1 },
  videoStreamIndex: 0,
  audioStreamIndex: 1,
  sourceDuration: 100,
  segments: [{ start: 10, end: 20, originalIndex: 2 }],
  config: {
    rect: { x: 101, y: 51, width: 853, height: 479 },
    aspectPreset: 'free',
    output: {
      resize: false,
      width: 853,
      height: 479,
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
  },
});

describe('Crop Video Phase 3A export planner', () => {
  it('preserves odd crop coordinates and pads encoded output without changing the crop', () => {
    const request = makeRequest();
    const plan = createCropExportPlan(request);
    expect(plan.crop).toStrictEqual(request.config.rect);
    expect(plan.outputWidth).toBe(853);
    expect(plan.outputHeight).toBe(479);
    expect([plan.encodedWidth, plan.encodedHeight]).toStrictEqual([854, 480]);
    expect(plan.tasks).toStrictEqual([{ start: 10, end: 20, originalIndex: 2, outputName: 'test.clip_segment_01.mp4' }]);
    request.config.rect.x = 999;
    expect(plan.crop.x).toBe(101);
  });

  it('sorts segments and gives separate files deterministic names', () => {
    const request = makeRequest();
    request.config.output.outputMode = 'separate';
    request.segments = [{ start: 30, end: 40, originalIndex: 3 }, { start: 10, end: 20, originalIndex: 2 }];
    const plan = createCropExportPlan(request);
    expect(plan.tasks.map((task) => task.outputName)).toStrictEqual(['test.clip_segment_01.mp4', 'test.clip_segment_02.mp4']);
    expect(plan.tasks.map((task) => task.start)).toStrictEqual([10, 30]);
  });

  it('plans an independent merge output for multiple segments', () => {
    const request = makeRequest();
    request.segments = [{ start: 20, end: 30, originalIndex: 1 }, { start: 0, end: 10, originalIndex: 0 }];
    const plan = createCropExportPlan(request);
    expect(plan.mergedOutputName).toBe('test.clip_segments_merge.mp4');
    expect(plan.tasks).toHaveLength(2);
  });

  it('preserves display SAR for original-size output and switches to square pixels for resize', () => {
    const request = makeRequest();
    request.frame.sarNum = 16;
    request.frame.sarDen = 15;
    expect(createCropExportPlan(request)).toMatchObject({ outputSarNum: 16, outputSarDen: 15 });
    request.config.output.resize = true;
    request.config.output.width = 1280;
    request.config.output.height = 720;
    expect(createCropExportPlan(request)).toMatchObject({ outputSarNum: 1, outputSarDen: 1 });
  });

  it('inverts original SAR for a source display quarter-turn', () => {
    const request = makeRequest();
    request.frame = { width: 1080, height: 1920, rotation: 90, sarNum: 4, sarDen: 3 };
    expect(createCropExportPlan(request)).toMatchObject({ outputSarNum: 3, outputSarDen: 4 });
  });

  it('rejects invalid empty selections, overlaps in merge and unsupported Custom', () => {
    const request = makeRequest();
    request.segments = [];
    expect(() => createCropExportPlan(request)).toThrow('No exportable segments selected');
    request.segments = [{ start: 10, end: 20, originalIndex: 0 }, { start: 19, end: 30, originalIndex: 1 }];
    expect(() => createCropExportPlan(request)).toThrow('Overlapping segments cannot be merged');
    request.config.output.outputMode = 'separate';
    expect(() => createCropExportPlan(request)).not.toThrow('Missing temporary output path');
    request.config.output.quality = 'custom';
    expect(() => createCropExportPlan(request)).toThrow('Unsupported crop encoding preset');
  });

  it('requires an exact entire-video segment instead of silently exporting a selection', () => {
    const request = makeRequest();
    request.config.output.timeRange = 'entire';
    expect(() => createCropExportPlan(request)).toThrow('Entire video must cover the full source duration');
    request.segments = [{ start: 0, end: 100, originalIndex: 0 }];
    expect(() => createCropExportPlan(request)).not.toThrow('Missing temporary output path');
  });
});

// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getLosslessExportPlan } from './losslessExportPlan';

const sourcePath = String.raw`D:\Videos\Example.mp4`;
const base = {
  sourcePath,
  extension: 'mp4',
  segmentCount: 1,
  areWeCutting: false,
  willMerge: false,
  segmentsToChaptersOnly: false,
};

describe('Lossless export output plan', () => {
  it('uses the fixed Lossless workspace and whole-video filename', () => {
    expect(getLosslessExportPlan(base)).toStrictEqual({
      directory: String.raw`D:\Videos\Example\Lossless`,
      filename: 'Example_lossless.mp4',
      cutFileNames: ['Example_lossless.mp4'],
    });
  });

  it('names one selected segment using the existing segment convention', () => {
    expect(getLosslessExportPlan({ ...base, areWeCutting: true })).toMatchObject({
      filename: 'Example_segment_01.mp4',
      cutFileNames: ['Example_segment_01.mp4'],
    });
  });

  it('names multiple segments sequentially without allowing user overrides', () => {
    expect(getLosslessExportPlan({ ...base, areWeCutting: true, segmentCount: 3 })).toMatchObject({
      filename: 'Example_segment_01.mp4',
      cutFileNames: ['Example_segment_01.mp4', 'Example_segment_02.mp4', 'Example_segment_03.mp4'],
    });
  });

  it('keeps merged output distinct from its staged segments', () => {
    expect(getLosslessExportPlan({ ...base, areWeCutting: true, willMerge: true, segmentCount: 2 })).toMatchObject({
      filename: 'Example_segments_merge.mp4',
      cutFileNames: ['Example_segment_01.mp4', 'Example_segment_02.mp4'],
    });
  });

  it('preserves chapter-only mode precedence and alternate extensions', () => {
    expect(getLosslessExportPlan({
      ...base, extension: 'mkv', segmentsToChaptersOnly: true, willMerge: true, segmentCount: 2,
    })).toMatchObject({
      filename: 'Example_chapters.mkv',
      cutFileNames: ['Example_segment_01.mkv', 'Example_segment_02.mkv'],
    });
  });

  it('uses three digits when there are at least 100 segments', () => {
    const plan = getLosslessExportPlan({ ...base, areWeCutting: true, segmentCount: 100 });
    expect(plan.cutFileNames).toHaveLength(100);
    expect(plan.cutFileNames[0]).toBe('Example_segment_001.mp4');
    expect(plan.cutFileNames[99]).toBe('Example_segment_100.mp4');
    expect(plan.filename).toBe('Example_segment_001.mp4');
  });
});

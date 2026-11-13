// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getCropExportPresentation, getCropExportSegmentPosition } from './cropExportPresentation';

describe('crop export progress presentation', () => {
  it('keeps every active state open for progress and cancellation', () => {
    for (const state of ['preparing', 'encoding', 'merging', 'verifying', 'committing', 'cleaning'] as const) {
      expect(getCropExportPresentation({ state }).active).toBe(true);
    }
  });

  it('shows current segment numbers starting at one', () => {
    expect(getCropExportSegmentPosition({ state: 'encoding', completedSegments: 0, totalSegments: 2 })).toStrictEqual({ current: 1, total: 2 });
    expect(getCropExportSegmentPosition({ state: 'encoding', completedSegments: 1, totalSegments: 2 })).toStrictEqual({ current: 2, total: 2 });
    expect(getCropExportSegmentPosition({ state: 'preparing', completedSegments: 0, totalSegments: 3 })).toStrictEqual({ current: 1, total: 3 });
    expect(getCropExportSegmentPosition({ state: 'verifying', completedSegments: 1, totalSegments: 3 })).toStrictEqual({ current: 2, total: 3 });
    expect(getCropExportSegmentPosition({ state: 'merging', completedSegments: 2, totalSegments: 2 })).toStrictEqual({ current: 2, total: 2 });
    expect(getCropExportSegmentPosition({ state: 'encoding', completedSegments: 0, totalSegments: 1 })).toStrictEqual({ current: 1, total: 1 });
  });

  it('shows terminal outcomes without active progress controls', () => {
    expect(getCropExportPresentation({ state: 'success' })).toMatchObject({ active: false, title: 'Crop export completed' });
    expect(getCropExportPresentation({ state: 'partial_success' })).toMatchObject({ active: false, title: 'Crop export partially completed' });
    expect(getCropExportPresentation({ state: 'failed' }).active).toBe(false);
    expect(getCropExportPresentation({ state: 'cancelled' }).active).toBe(false);
  });
});

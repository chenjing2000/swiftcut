import { describe, expect, it } from 'vitest';
import {
  doCropSegmentsOverlap, getDefaultCropTimeRange, getExplicitCropSegments,
  resolveVideoCropSegments,
} from './videoCropSegments';

describe('Crop Video time ranges', () => {
  const segments = [
    { start: 0, end: 100, initial: true, selected: true },
    { start: 40, end: 50, selected: true },
    { start: 10, end: 20, selected: true },
    { start: 25, end: 25, selected: true },
    { start: 60, end: 70, selected: false },
  ];

  it('ignores the initial segment, markers and unselected segments, then orders by time', () => {
    expect(getExplicitCropSegments(segments, 100)).toEqual([
      { start: 10, end: 20, originalIndex: 2 },
      { start: 40, end: 50, originalIndex: 1 },
    ]);
  });

  it('does not inherit ordinary export fallback', () => {
    expect(getDefaultCropTimeRange([{ start: 2, end: 3, selected: false }], 10)).toBe('entire');
    expect(resolveVideoCropSegments({ segments: [{ start: 2, end: 3, selected: false }], duration: 10, timeRange: 'selected' })).toEqual([]);
  });

  it('uses whole-file time range independently of selections', () => {
    expect(resolveVideoCropSegments({ segments, duration: 100, timeRange: 'entire' }))
      .toEqual([{ start: 0, end: 100, originalIndex: 0 }]);
  });

  it('handles already-resolved inverse intervals separately', () => {
    expect(resolveVideoCropSegments({
      segments, inverted: true, inverseSegments: [{ start: 90, end: 100 }, { start: 0, end: 10 }],
      duration: 100, timeRange: 'selected',
    })).toEqual([{ start: 0, end: 10, originalIndex: 1 }, { start: 90, end: 100, originalIndex: 0 }]);
  });

  it('detects overlapping intervals without silently merging them', () => {
    expect(doCropSegmentsOverlap([
      { start: 1, end: 3, originalIndex: 0 }, { start: 2, end: 4, originalIndex: 1 },
    ])).toBe(true);
  });
});

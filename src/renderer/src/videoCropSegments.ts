import type { CropTimeRange, CropTimeSegment } from '../../common/videoCropTypes';

export interface CropSourceSegment {
  start: number;
  end?: number | undefined;
  selected?: boolean | undefined;
  initial?: boolean | undefined;
}

export function getExplicitCropSegments(segments: readonly CropSourceSegment[], duration: number): CropTimeSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return segments.flatMap((segment, originalIndex) => {
    if (!segment.selected || segment.initial || segment.end == null
      || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)
      || segment.start < 0 || segment.end > duration || segment.start >= segment.end) return [];
    return [{ start: segment.start, end: segment.end, originalIndex }];
  }).toSorted((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);
}

/** Crop Video avoids the ordinary export selection fallback; inverse intervals are caller-resolved. */
export function resolveVideoCropSegments({
  segments, inverseSegments, inverted, duration, timeRange,
}: {
  segments: readonly CropSourceSegment[];
  inverseSegments?: readonly Pick<CropSourceSegment, 'start' | 'end'>[];
  inverted?: boolean;
  duration: number;
  timeRange: CropTimeRange;
}): CropTimeSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid video duration');
  if (timeRange === 'entire') return [{ start: 0, end: duration, originalIndex: 0 }];
  if (inverted) {
    if (!inverseSegments) throw new Error('Inverse segments are unavailable');
    const ranges = inverseSegments.flatMap((seg, originalIndex) => (
      seg.end != null && Number.isFinite(seg.start) && Number.isFinite(seg.end)
      && seg.start >= 0 && seg.end <= duration && seg.end > seg.start
        ? [{ start: seg.start, end: seg.end, originalIndex }] : []
    ));
    return ranges.toSorted((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);
  }
  return getExplicitCropSegments(segments, duration);
}

export function getDefaultCropTimeRange(segments: readonly CropSourceSegment[], duration: number): CropTimeRange {
  return getExplicitCropSegments(segments, duration).length > 0 ? 'selected' : 'entire';
}

export function doCropSegmentsOverlap(segments: readonly CropTimeSegment[]) {
  const sorted = segments.toSorted((a, b) => a.start - b.start);
  return sorted.some((segment, i) => i > 0 && segment.start < sorted[i - 1]!.end);
}

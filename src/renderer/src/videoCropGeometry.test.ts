import { describe, expect, it } from 'vitest';
import {
  alignCropSize, cropPointToScreen, getCropDisplayTransform, getCropVisibleSar,
  getCropVisibleSize, isValidCropRect, sanitizeCropDigits, screenToCropPoint,
  visibleRectToFrameRect,
} from './videoCropGeometry';

const frame = { width: 1920, height: 1080, rotation: 0 as const, sarNum: 1, sarDen: 1 };

describe('crop pixel geometry', () => {
  it('preserves correct containment and letterbox offsets', () => {
    const viewport = { left: 10, top: 20, width: 800, height: 600, fit: 'contain' as const };
    const transform = getCropDisplayTransform(frame, viewport);
    expect(transform.drawnTop).toBe(95);
    expect(screenToCropPoint({ x: 10, y: 95 }, frame, viewport)).toStrictEqual({ x: 0, y: 0 });
    expect(screenToCropPoint({ x: 10, y: 20 }, frame, viewport)).toBeUndefined();
    expect(cropPointToScreen({ x: 1920, y: 1080 }, frame, viewport)).toStrictEqual({ x: 810, y: 545 });
  });

  it('handles fill and cover without changing source coordinates', () => {
    const viewport = { left: 0, top: 0, width: 500, height: 500, fit: 'cover' as const };
    expect(screenToCropPoint({ x: 250, y: 250 }, frame, viewport)).toStrictEqual({ x: 960, y: 540 });
    expect(screenToCropPoint({ x: 0, y: 0 }, frame, { ...viewport, fit: 'fill' })).toStrictEqual({ x: 0, y: 0 });
  });

  it('snaps floating-point edge noise without accepting real out-of-bounds points', () => {
    const viewport = { left: 0, top: 0, width: 500, height: 500, fit: 'fill' as const };
    expect(screenToCropPoint({ x: 0, y: 0 }, frame, viewport)).toStrictEqual({ x: 0, y: 0 });
    expect(screenToCropPoint({ x: 500, y: 500 }, frame, viewport)).toStrictEqual({ x: 1920, y: 1080 });
    expect(screenToCropPoint({ x: -0.01, y: 0 }, frame, viewport)).toBeUndefined();
    expect(screenToCropPoint({ x: 500.01, y: 500 }, frame, viewport)).toBeUndefined();
  });

  it('respects CSS object-fit none and scale-down', () => {
    const viewport = { left: 0, top: 0, width: 800, height: 600, fit: 'none' as const };
    const none = getCropDisplayTransform(frame, viewport);
    expect(none.drawnWidth).toBe(1920);
    expect(none.drawnHeight).toBe(1080);
    expect(none.drawnLeft).toBe(-560);
    const reduced = getCropDisplayTransform(frame, { ...viewport, fit: 'scale-down' });
    expect(reduced.drawnWidth).toBe(800);
    expect(reduced.drawnHeight).toBe(450);
    const smallFrame = { ...frame, width: 200, height: 100 };
    const unscaled = getCropDisplayTransform(smallFrame, { ...viewport, fit: 'scale-down' });
    expect(unscaled.drawnWidth).toBe(200);
    expect(unscaled.drawnHeight).toBe(100);
  });

  it('maps rectangles through all quarter turns', () => {
    const crop = { x: 10, y: 20, width: 100, height: 200 };
    expect(visibleRectToFrameRect(crop, frame)).toStrictEqual(crop);
    expect(visibleRectToFrameRect(crop, { ...frame, rotation: 90 })).toStrictEqual({ x: 1700, y: 10, width: 200, height: 100 });
    expect(visibleRectToFrameRect(crop, { ...frame, rotation: 180 })).toStrictEqual({ x: 1810, y: 860, width: 100, height: 200 });
    expect(visibleRectToFrameRect(crop, { ...frame, rotation: 270 })).toStrictEqual({ x: 20, y: 970, width: 200, height: 100 });
  });

  it('inverts sample aspect ratio when turned', () => {
    const sar = { ...frame, sarNum: 16, sarDen: 15 };
    expect(getCropVisibleSar(sar)).toBeCloseTo(16 / 15);
    expect(getCropVisibleSar({ ...sar, rotation: 90 })).toBeCloseTo(15 / 16);
    expect(getCropVisibleSize({ ...sar, rotation: 90 })).toStrictEqual({ width: 1080, height: 1920 });
  });

  it('keeps an edited width and chooses the smaller integer on ties', () => {
    expect(alignCropSize({ frame, rect: { x: 0, y: 0, width: 1000, height: 100 }, aspect: 16 / 9, primary: 'width' }))
      .toStrictEqual({ x: 0, y: 0, width: 1000, height: 562 });
  });

  it('never allows out-of-bounds or empty pixel rectangles', () => {
    const result = alignCropSize({ frame, rect: { x: 1800, y: 1000, width: 200, height: 100 }, aspect: 1, primary: 'width' });
    expect(isValidCropRect(result, frame)).toBe(true);
    expect(isValidCropRect({ x: 0, y: 0, width: 0, height: 10 }, frame)).toBe(false);
  });

  it('only permits ASCII digits in crop inputs', () => {
    expect(sanitizeCropDigits('12.3-4e5 abc')).toBe('12345');
    expect(sanitizeCropDigits('')).toBe('');
  });
});

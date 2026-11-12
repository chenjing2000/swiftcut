import { describe, expect, it } from 'vitest';
import { getCropEncodedDimensions, validateCropRect, validateCropOutput } from '../../common/videoCropValidation.js';
import type { CropOutputSettings } from '../../common/videoCropTypes.js';

describe('Crop Video validation', () => {
  it('rejects invalid or out-of-bounds crop regions', () => {
    expect(validateCropRect({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toStrictEqual([]);
    expect(validateCropRect({ x: -1, y: 0, width: 5, height: 5 }, { width: 100, height: 100 }).length).toBeGreaterThan(0);
    expect(validateCropRect({ x: 99, y: 0, width: 2, height: 5 }, { width: 100, height: 100 }).length).toBeGreaterThan(0);
    expect(validateCropRect({ x: 0, y: 0, width: 0, height: 5 }, { width: 100, height: 100 }).length).toBeGreaterThan(0);
  });

  it('pads only when the chosen pixel format requires it', () => {
    expect(getCropEncodedDimensions({ width: 801, height: 601, pixelFormat: 'yuv420p', padToCompatible: true }))
      .toStrictEqual({ width: 802, height: 602, needsPadding: true });
    expect(getCropEncodedDimensions({ width: 801, height: 601, pixelFormat: 'yuv444p', padToCompatible: false }))
      .toStrictEqual({ width: 801, height: 601, needsPadding: false });
    expect(() => getCropEncodedDimensions({ width: 801, height: 601, pixelFormat: 'yuv420p', padToCompatible: false })).toThrow('Pixel format is incompatible with the requested output dimensions');
    expect(getCropEncodedDimensions({ width: 802, height: 601, pixelFormat: 'yuv422p', padToCompatible: false }))
      .toStrictEqual({ width: 802, height: 601, needsPadding: false });
  });

  it('validates the effective output size without changing crop size', () => {
    const settings: CropOutputSettings = {
      resize: false,
      width: 800,
      height: 600,
      lockAspect: true,
      quality: 'high',
      encoder: 'libx264',
      crf: 18,
      preset: 'medium',
      pixelFormat: 'yuv420p',
      format: 'mp4',
      keepAudio: true,
      timeRange: 'entire',
      outputMode: 'merge',
    };
    expect(validateCropOutput(settings, { x: 0, y: 0, width: 801, height: 601 })).toStrictEqual([]);
    expect(validateCropOutput({ ...settings, resize: true, width: 0 }, { x: 0, y: 0, width: 801, height: 601 })).toHaveLength(1);
  });
});

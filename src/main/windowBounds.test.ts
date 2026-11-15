// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { fitsWindowWorkArea } from './windowBounds.ts';

describe('saved window size', () => {
  const area = { width: 1280, height: 960 };

  it('restores a size when both dimensions fit', () => {
    expect(fitsWindowWorkArea({ width: 1000, height: 700 }, area)).toBe(true);
    expect(fitsWindowWorkArea({ width: 1280, height: 960 }, area)).toBe(true);
  });

  it('rejects a width larger than the work area', () => {
    expect(fitsWindowWorkArea({ width: 1600, height: 700 }, area)).toBe(false);
  });

  it('rejects a height larger than the work area', () => {
    expect(fitsWindowWorkArea({ width: 1000, height: 1100 }, area)).toBe(false);
  });

  it('rejects when both dimensions are larger than the work area', () => {
    expect(fitsWindowWorkArea({ width: 1600, height: 1100 }, area)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { getCropKeyboardNudge } from './videoCropKeyboardNudge';

describe('crop keyboard movement', () => {
  it.each([
    ['ArrowLeft', -1, 0],
    ['ArrowRight', 1, 0],
    ['ArrowUp', 0, -1],
    ['ArrowDown', 0, 1],
  ])('moves one pixel with %s', (key, dx, dy) => {
    expect(getCropKeyboardNudge(key, false)).toStrictEqual({ dx, dy });
  });

  it.each([
    ['ArrowLeft', -10, 0],
    ['ArrowRight', 10, 0],
    ['ArrowUp', 0, -10],
    ['ArrowDown', 0, 10],
  ])('moves ten pixels with Shift+%s', (key, dx, dy) => {
    expect(getCropKeyboardNudge(key, true)).toStrictEqual({ dx, dy });
  });

  it('does not move for unrelated keys', () => {
    expect(getCropKeyboardNudge('Escape', true)).toStrictEqual({ dx: 0, dy: 0 });
  });
});

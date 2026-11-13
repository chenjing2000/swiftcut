// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getSourceDisplayRotation } from './videoCropRotation';

describe('video crop source display rotation', () => {
  it('reads legacy rotate tags', () => {
    expect(getSourceDisplayRotation({ tags: { rotate: '90' } })).toBe(90);
    expect(getSourceDisplayRotation({ tags: { rotate: '-90' } })).toBe(270);
  });
  it('uses display matrix rotation when a modern MP4 has no rotate tag', () => {
    expect(getSourceDisplayRotation({
      side_data_list: [{ side_data_type: 'Display Matrix', rotation: 90 }],
    })).toBe(90);
  });
  it('prefers the display matrix when metadata sources disagree', () => {
    expect(getSourceDisplayRotation({
      tags: { rotate: '180' },
      side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }],
    })).toBe(270);
  });
  it('ignores invalid data and unrelated stream side data', () => {
    expect(getSourceDisplayRotation(undefined)).toBeUndefined();
    expect(getSourceDisplayRotation({ tags: { rotate: 'nope' } })).toBeUndefined();
    expect(getSourceDisplayRotation({
      side_data_list: [{ side_data_type: 'Other', rotation: 90 }],
    })).toBeUndefined();
  });
});

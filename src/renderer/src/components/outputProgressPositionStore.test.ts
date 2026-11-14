// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getOutputProgressPosition, setOutputProgressPosition } from './outputProgressPositionStore';

describe('Output progress window position memory', () => {
  it('keeps independent coordinates for all three progress windows', () => {
    setOutputProgressPosition('audio-progress', { left: 10, top: 20 });
    setOutputProgressPosition('crop-progress', { left: 110, top: 120 });
    setOutputProgressPosition('lossless-progress', { left: 210, top: 220 });

    expect(getOutputProgressPosition('audio-progress')).toStrictEqual({ left: 10, top: 20 });
    expect(getOutputProgressPosition('crop-progress')).toStrictEqual({ left: 110, top: 120 });
    expect(getOutputProgressPosition('lossless-progress')).toStrictEqual({ left: 210, top: 220 });
  });

  it('keeps previously stored positions when another task begins', () => {
    setOutputProgressPosition('audio-progress', { left: 30, top: 40 });
    const existing = getOutputProgressPosition('audio-progress');
    expect(existing).toStrictEqual({ left: 30, top: 40 });
    setOutputProgressPosition('audio-progress', { left: 50, top: 60 });
    expect(existing).toStrictEqual({ left: 30, top: 40 });
    expect(getOutputProgressPosition('audio-progress')).toStrictEqual({ left: 50, top: 60 });
  });
});

// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';
import {
  canCropVideo, canExtractAudio, commonAudioExtensions,
  commonVideoExtensions, getMediaInputExtension, isCommonMediaInput,
} from './mediaInputSupport.ts';

describe('Common media input support', () => {
  test('recognizes the approved video and audio extensions without case sensitivity', () => {
    for (const ext of [...commonVideoExtensions, ...commonAudioExtensions]) {
      expect(isCommonMediaInput(`C:\\Media\\sample.${ext.toUpperCase()}`)).toBe(true);
    }
    expect(getMediaInputExtension('/videos/camera.MOV')).toBe('mov');
    expect(isCommonMediaInput('/videos/readme.txt')).toBe(false);
    expect(isCommonMediaInput(undefined)).toBe(false);
  });

  test('extraction requires an audio stream for video and audio files', () => {
    expect(canExtractAudio('/videos/iphone.mov', [{ codec_type: 'video' }, { codec_type: 'audio' }])).toBe(true);
    expect(canExtractAudio('/music/track.flac', [{ codec_type: 'audio' }])).toBe(true);
    expect(canExtractAudio('/videos/silent.mov', [{ codec_type: 'video' }])).toBe(false);
    expect(canExtractAudio('/fake.mp3', [])).toBe(false);
  });

  test('crop requires a supported video input and video stream', () => {
    expect(canCropVideo('/videos/iphone.mov', [{ codec_type: 'video' }])).toBe(true);
    expect(canCropVideo('/music/track.wav', [{ codec_type: 'audio' }])).toBe(false);
    expect(canCropVideo('/fake.mov', [{ codec_type: 'audio' }])).toBe(false);
  });
});

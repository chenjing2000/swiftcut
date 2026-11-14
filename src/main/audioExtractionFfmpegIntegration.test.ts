// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMp3FfmpegArgs,
  buildOriginalAudioFfmpegArgs,
  getOriginalAudioOutputFormat,
} from './audioExtractionUtils.js';

const enabled = process.env['SWIFTCUT_CROP_FFMPEG_TEST'] === '1';

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 60_000 });
}

function probeAudio(path: string): { streams: { codec_type: string; codec_name: string }[] } {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', path,
  ], { timeout: 60_000 });
  return JSON.parse(out.toString('utf8')) as { streams: { codec_type: string; codec_name: string }[] };
}

describe.skipIf(!enabled)('Audio extraction with real FFmpeg', () => {
  it.each([
    { extension: 'flac', codec: 'flac' },
    { extension: 'wav', codec: 'pcm_s16le' },
    { extension: 'mp3', codec: 'mp3' },
  ])('copies an original $extension audio file without transcoding', ({ extension, codec }) => {
    const dir = mkdtempSync(join(tmpdir(), 'swiftcut-audio-real-'));
    try {
      const source = join(dir, `music.${extension}`);
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
        '-c:a', codec === 'mp3' ? 'libmp3lame' : codec, '-y', source]);
      const format = getOriginalAudioOutputFormat(codec);
      const output = join(dir, `extracted.${format.extension}`);
      ffmpeg(buildOriginalAudioFfmpegArgs({
        inputPath: source, streamIndex: 0, outputFormat: format, outputPath: output,
      }));
      expect(probeAudio(output).streams).toStrictEqual([{ codec_type: 'audio', codec_name: codec }]);
      ffmpeg(['-xerror', '-i', output, '-f', 'null', '-']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('copies AAC audio from an iPhone-style MOV source to M4A', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swiftcut-mov-audio-'));
    try {
      const source = join(dir, 'iphone.mov');
      ffmpeg([
        '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'mpeg4', '-c:a', 'aac', '-y', source,
      ]);
      const output = join(dir, 'iphone_audio.m4a');
      ffmpeg(buildOriginalAudioFfmpegArgs({
        inputPath: source, streamIndex: 1,
        outputFormat: getOriginalAudioOutputFormat('aac'), outputPath: output,
      }));
      expect(probeAudio(output).streams).toStrictEqual([{ codec_type: 'audio', codec_name: 'aac' }]);
      ffmpeg(['-xerror', '-i', output, '-f', 'null', '-']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('converts WAV input to MP3 only when MP3 output is selected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swiftcut-mp3-audio-'));
    try {
      const source = join(dir, 'input.wav');
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:a', 'pcm_s16le', '-y', source]);
      const output = join(dir, 'converted.mp3');
      ffmpeg(buildMp3FfmpegArgs({ inputPath: source, streamIndex: 0, quality: '192k', outputPath: output }));
      expect(probeAudio(output).streams).toStrictEqual([{ codec_type: 'audio', codec_name: 'mp3' }]);
      ffmpeg(['-xerror', '-i', output, '-f', 'null', '-']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

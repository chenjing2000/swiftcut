// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';
import { buildMp3FfmpegArgs, createAudioExtractionTasks, normalizeAudioExtractionSegments, parseFfprobeJson } from './audioExtractionUtils.ts';

describe('MP3 extraction arguments', () => {
  const inputPath = '中文 文件.mp4';
  const outputPath = '中文 文件.tmp.mp3';

  for (const [quality, expected] of [
    ['vbr', ['-q:a', '2']],
    ['320k', ['-b:a', '320k']],
    ['192k', ['-b:a', '192k']],
  ] as const) {
    test(`builds FFmpeg arguments for ${quality}`, () => {
      const args = buildMp3FfmpegArgs({ inputPath, streamIndex: 2, quality, outputPath });
      expect(args).toContain(inputPath);
      expect(args).toContain('0:2');
      expect(args).toContain('libmp3lame');
      expect(args.slice(-3)).toStrictEqual([...expected, outputPath]);
      expect(args).toContain('-vn');
      expect(args).toContain('-sn');
      expect(args).toContain('-dn');
      expect(args).not.toContain('copy');
    });
  }
});

describe('FFprobe JSON parsing', () => {
  const json = JSON.stringify({
    streams: [{ index: 1, codec_type: 'audio', codec_name: 'aac' }],
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5' },
  });

  test('decodes UTF-8 Buffer output from runFfprobe', () => {
    const result = parseFfprobeJson(Buffer.from(json, 'utf8'));
    expect(result.format?.format_name).toContain('mp4');
    expect(result.streams?.[0]).toMatchObject({ index: 1, codec_type: 'audio', codec_name: 'aac' });
  });

  test('accepts a UTF-8 BOM and harmless text around the JSON object', () => {
    const result = parseFfprobeJson(Buffer.from(`\u{FEFF}FFprobe metadata\n${json}\n`, 'utf8'));
    expect(result.streams).toHaveLength(1);
  });

  test('reports a useful error when FFprobe returns no JSON', () => {
    expect(() => parseFfprobeJson(Buffer.from('ffprobe failed'))).toThrow('FFprobe did not return JSON');
  });
});


describe('MP3 extraction segments and task planning', () => {
  test('uses the complete media duration when no explicit segments are supplied', () => {
    expect(normalizeAudioExtractionSegments([], 12.5)).toStrictEqual([{ start: 0, end: 12.5 }]);
  });

  test('keeps the complete-media segment open-ended when duration is unavailable', () => {
    expect(normalizeAudioExtractionSegments([], undefined)).toStrictEqual([{ start: 0 }]);
  });

  test('clamps a segment end to a small duration rounding difference', () => {
    expect(normalizeAudioExtractionSegments([{ start: 1, end: 12.6 }], 12.5)).toStrictEqual([{ start: 1, end: 12.5 }]);
  });

  test('rejects invalid and out-of-range segments', () => {
    expect(() => normalizeAudioExtractionSegments([{ start: 4, end: 3 }], 12)).toThrow('Invalid extraction segment');
    expect(() => normalizeAudioExtractionSegments([{ start: 11, end: 13 }], 12)).toThrow('outside the media duration');
  });

  test('creates one task for every segment and selected audio track', () => {
    const tasks = createAudioExtractionTasks({
      segments: [{ start: 1, end: 3 }, { start: 5, end: 8 }],
      selectedStreamIndexes: [1, 2],
      audioStreamIndexes: [1, 2],
    });

    expect(tasks).toHaveLength(4);
    expect(tasks.map(({ segmentNumber, trackNumber, streamIndex, outputSuffix }) => ({
      segmentNumber, trackNumber, streamIndex, outputSuffix,
    }))).toStrictEqual([
      { segmentNumber: 1, trackNumber: 1, streamIndex: 1, outputSuffix: '_segment-01_track-01' },
      { segmentNumber: 1, trackNumber: 2, streamIndex: 2, outputSuffix: '_segment-01_track-02' },
      { segmentNumber: 2, trackNumber: 1, streamIndex: 1, outputSuffix: '_segment-02_track-01' },
      { segmentNumber: 2, trackNumber: 2, streamIndex: 2, outputSuffix: '_segment-02_track-02' },
    ]);
  });

  test('creates concise names for a single dimension of multiple outputs', () => {
    const trackTasks = createAudioExtractionTasks({
      segments: [{ start: 0, end: 12 }],
      selectedStreamIndexes: [1, 2],
      audioStreamIndexes: [1, 2],
    });
    const segmentTasks = createAudioExtractionTasks({
      segments: [{ start: 0, end: 4 }, { start: 4, end: 8 }],
      selectedStreamIndexes: [1],
      audioStreamIndexes: [1, 2],
    });

    expect(trackTasks.map((task) => task.outputSuffix)).toStrictEqual(['_track-01', '_track-02']);
    expect(segmentTasks.map((task) => task.outputSuffix)).toStrictEqual(['_segment-01', '_segment-02']);
  });

  test('rejects empty, duplicate, or non-audio stream selections', () => {
    expect(() => createAudioExtractionTasks({
      segments: [{ start: 0, end: 1 }],
      selectedStreamIndexes: [],
      audioStreamIndexes: [1],
    })).toThrow('Select at least one audio track');
    expect(() => createAudioExtractionTasks({
      segments: [{ start: 0, end: 1 }],
      selectedStreamIndexes: [1, 1],
      audioStreamIndexes: [1],
    })).toThrow('Duplicate audio stream selection');
    expect(() => createAudioExtractionTasks({
      segments: [{ start: 0, end: 1 }],
      selectedStreamIndexes: [0],
      audioStreamIndexes: [1],
    })).toThrow('is not an audio track');
  });

  test('adds accurate output-side seeking and duration arguments', () => {
    const args = buildMp3FfmpegArgs({
      inputPath: 'lecture.mp4',
      streamIndex: 2,
      quality: '192k',
      outputPath: 'lecture_segment-02_track-02.tmp.mp3',
      segment: { start: 5.25, end: 8.75 },
    });

    expect(args).toContain('-ss');
    expect(args).toContain('5.25');
    expect(args).toContain('-t');
    expect(args).toContain('3.5');
    expect(args).toContain('0:2');
    expect(args.slice(-3)).toStrictEqual(['-b:a', '192k', 'lecture_segment-02_track-02.tmp.mp3']);
  });
});

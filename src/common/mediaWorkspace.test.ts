// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { assertOutputFilename, findAvailableBatchNames, getMediaOutputDir, getMediaOutputName, getMediaWorkspaceDir, withCollisionSuffix } from './mediaWorkspace.js';

describe('media workspace', () => {
  it('creates a sibling stem workspace for Windows and POSIX paths', () => {
    expect(getMediaWorkspaceDir(String.raw`D:\Videos\Travel.mp4`)).toBe(String.raw`D:\Videos\Travel`);
    expect(getMediaOutputDir(String.raw`D:\Videos\Travel.mkv`, 'lossless')).toBe(String.raw`D:\Videos\Travel\Lossless`);
    expect(getMediaOutputDir('/media/Travel.mp4', 'crop')).toBe('/media/Travel/Croploss');
    expect(getMediaWorkspaceDir('/media/My Video.2026.mp4')).toBe('/media/My Video.2026');
  });

  it('uses consistent names for whole files, segments, merges and chapters', () => {
    const sourcePath = '/media/Travel.mp4';
    expect(getMediaOutputName({ sourcePath, kind: 'lossless', mode: 'entire', extension: 'mp4' })).toBe('Travel_lossless.mp4');
    expect(getMediaOutputName({ sourcePath, kind: 'crop', mode: 'entire', extension: 'mkv' })).toBe('Travel_croploss.mkv');
    expect(getMediaOutputName({ sourcePath, kind: 'crop', mode: 'segment', extension: 'mp4', segmentIndex: 2, segmentCount: 3 })).toBe('Travel_segment_02.mp4');
    expect(getMediaOutputName({ sourcePath, kind: 'lossless', mode: 'segment', extension: 'mp4', segmentIndex: 120, segmentCount: 120 })).toBe('Travel_segment_120.mp4');
    expect(getMediaOutputName({ sourcePath, kind: 'lossless', mode: 'merge', extension: 'mp4' })).toBe('Travel_segments_merge.mp4');
    expect(getMediaOutputName({ sourcePath, kind: 'lossless', mode: 'chapters', extension: 'mp4' })).toBe('Travel_chapters.mp4');
  });

  it('uses a space and parentheses for collisions', () => {
    expect(withCollisionSuffix('Travel_lossless.mp4', 0)).toBe('Travel_lossless.mp4');
    expect(withCollisionSuffix('Travel_lossless.mp4', 2)).toBe('Travel_lossless (2).mp4');
  });

  it('allocates one sequence for a batch and reuses gaps', async () => {
    const occupied = new Set(['Travel_segment_01.mp4', 'Travel_segment_01 (1).mp4', 'Travel_segment_02.mp4']);
    const result = await findAvailableBatchNames(['Travel_segment_01.mp4', 'Travel_segment_02.mp4'], async (name) => occupied.has(name));
    expect(result).toStrictEqual(['Travel_segment_01 (2).mp4', 'Travel_segment_02 (2).mp4']);
  });

  it('rejects unsafe filenames and malformed indexes', () => {
    expect(() => assertOutputFilename('..\\evil.mp4')).toThrow();
    expect(() => assertOutputFilename('CON.mp4')).toThrow();
    expect(() => getMediaOutputName({ sourcePath: '/a/a.mp4', kind: 'crop', mode: 'segment', extension: 'mp4', segmentIndex: 0, segmentCount: 3 })).toThrow();
  });
});

// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getLosslessCommitTargets, getLosslessPublishedPaths } from './losslessExportPublication';

const outFiles = [{ path: '/tmp/segment-1.mp4' }, { path: '/tmp/segment-2.mp4' }];
const cutFileNames = ['Movie_segment_01.mp4', 'Movie_segment_02.mp4'];
const extraOutputs = [{ temporaryPath: '/tmp/subtitle.srt', requestedName: 'subtitle.srt' }];

describe('Lossless export publication', () => {
  it('publishes cut segments and extra tracks in order without merging', () => {
    expect(getLosslessCommitTargets({
      outFiles, cutFileNames, willMerge: false, autoDeleteMergedSegments: false,
      mergedOutFilePath: undefined, mergedFilename: 'Movie_segments_merge.mp4', extraOutputs,
    })).toStrictEqual([
      { temporaryPath: '/tmp/segment-1.mp4', requestedName: 'Movie_segment_01.mp4' },
      { temporaryPath: '/tmp/segment-2.mp4', requestedName: 'Movie_segment_02.mp4' },
      extraOutputs[0],
    ]);
  });

  it('keeps intermediate segments before the merged file when requested', () => {
    expect(getLosslessCommitTargets({
      outFiles, cutFileNames, willMerge: true, autoDeleteMergedSegments: false,
      mergedOutFilePath: '/tmp/merged.mp4', mergedFilename: 'Movie_segments_merge.mp4', extraOutputs,
    }).map(({ requestedName }) => requestedName)).toStrictEqual([
      'Movie_segment_01.mp4', 'Movie_segment_02.mp4', 'Movie_segments_merge.mp4', 'subtitle.srt',
    ]);
  });

  it('publishes only the merged file and extras when segments are discarded', () => {
    expect(getLosslessCommitTargets({
      outFiles, cutFileNames, willMerge: true, autoDeleteMergedSegments: true,
      mergedOutFilePath: '/tmp/merged.mp4', mergedFilename: 'Movie_segments_merge.mp4', extraOutputs,
    })).toStrictEqual([
      { temporaryPath: '/tmp/merged.mp4', requestedName: 'Movie_segments_merge.mp4' },
      extraOutputs[0],
    ]);
  });

  it('reports all committed paths without merge', () => {
    expect(getLosslessPublishedPaths({
      committedPaths: ['a.mp4', 'b.mp4', 'subtitle.srt'], willMerge: false,
      autoDeleteMergedSegments: false, cutFileCount: 2,
    })).toStrictEqual(['a.mp4', 'b.mp4', 'subtitle.srt']);
  });

  it('reports the merged file, not the intermediate segments or extra tracks', () => {
    expect(getLosslessPublishedPaths({
      committedPaths: ['a.mp4', 'b.mp4', 'merged.mp4', 'subtitle.srt'],
      willMerge: true, autoDeleteMergedSegments: false, cutFileCount: 2,
    })).toStrictEqual(['merged.mp4']);
    expect(getLosslessPublishedPaths({
      committedPaths: ['merged.mp4', 'subtitle.srt'],
      willMerge: true, autoDeleteMergedSegments: true, cutFileCount: 2,
    })).toStrictEqual(['merged.mp4']);
  });

  it('preserves existing fallback when a merged output is missing', () => {
    expect(getLosslessPublishedPaths({
      committedPaths: ['other.mp4'], willMerge: true,
      autoDeleteMergedSegments: false, cutFileCount: 2,
    })).toStrictEqual(['other.mp4']);
  });
});

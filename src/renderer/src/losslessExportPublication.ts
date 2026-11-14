interface StagedOutput {
  path: string;
}

interface CommitTarget {
  temporaryPath: string;
  requestedName: string;
}

// The caller owns the FFmpeg files, safe commit transaction, and cleanup.
// Only the order of the outputs to publish is determined here.
export function getLosslessCommitTargets({
  outFiles, cutFileNames, willMerge, autoDeleteMergedSegments, mergedOutFilePath,
  mergedFilename, extraOutputs,
}: {
  outFiles: readonly StagedOutput[];
  cutFileNames: readonly string[];
  willMerge: boolean;
  autoDeleteMergedSegments: boolean;
  mergedOutFilePath: string | undefined;
  mergedFilename: string;
  extraOutputs: readonly CommitTarget[];
}): CommitTarget[] {
  if (willMerge && mergedOutFilePath == null) throw new Error('Missing staged Lossless merged output');
  return [
    ...(!willMerge || !autoDeleteMergedSegments ? outFiles.map((file, index) => ({
      temporaryPath: file.path,
      requestedName: cutFileNames[index]!,
    })) : []),
    ...(willMerge && mergedOutFilePath != null
      ? [{ temporaryPath: mergedOutFilePath, requestedName: mergedFilename }] : []),
    ...extraOutputs,
  ];
}

// Keep the complete published list for the progress UI. A missing merged
// result must be surfaced explicitly without turning a completed commit into
// a failed export or discarding files that were already published.
export function getLosslessPublishedPaths({
  committedPaths, willMerge, autoDeleteMergedSegments, cutFileCount,
}: {
  committedPaths: readonly string[];
  willMerge: boolean;
  autoDeleteMergedSegments: boolean;
  cutFileCount: number;
}): { paths: string[]; missingMergedOutput: boolean } {
  if (!willMerge) return { paths: [...committedPaths], missingMergedOutput: false };
  const mergedIndex = autoDeleteMergedSegments ? 0 : cutFileCount;
  const mergedPath = committedPaths[mergedIndex];
  if (mergedPath == null) return { paths: [...committedPaths], missingMergedOutput: true };
  return { paths: [mergedPath], missingMergedOutput: false };
}

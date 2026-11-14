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

// Keep progress history for every committed output, but report only the
// merged file to listeners when merging was requested.
export function getLosslessPublishedPaths({
  committedPaths, willMerge, autoDeleteMergedSegments, cutFileCount,
}: {
  committedPaths: readonly string[];
  willMerge: boolean;
  autoDeleteMergedSegments: boolean;
  cutFileCount: number;
}): string[] {
  if (!willMerge) return [...committedPaths];
  const mergedIndex = autoDeleteMergedSegments ? 0 : cutFileCount;
  const mergedPath = committedPaths[mergedIndex];
  return mergedPath == null ? [...committedPaths] : [mergedPath];
}

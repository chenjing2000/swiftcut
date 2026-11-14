import { getMediaOutputDir, getMediaOutputName, getSourceStem } from '../../common/mediaWorkspace.js';

interface LosslessExportPlanOptions {
  sourcePath: string;
  extension: string;
  segmentCount: number;
  areWeCutting: boolean;
  willMerge: boolean;
  segmentsToChaptersOnly: boolean;
}

// Build deterministic names before starting FFmpeg. The caller still owns
// temporary workspaces, cancellation, merging and safe publication.
export function getLosslessExportPlan({
  sourcePath, extension, segmentCount, areWeCutting, willMerge, segmentsToChaptersOnly,
}: LosslessExportPlanOptions) {
  const count = Math.max(1, segmentCount);
  let mode: 'chapters' | 'merge' | 'segment' | 'entire' = 'entire';
  if (segmentsToChaptersOnly) mode = 'chapters';
  else if (willMerge) mode = 'merge';
  else if (areWeCutting) mode = 'segment';
  const filename = getMediaOutputName({
    sourcePath,
    kind: 'lossless',
    mode,
    extension,
    ...(mode === 'segment' && { segmentIndex: 1, segmentCount: count }),
  });
  const stem = getSourceStem(sourcePath);
  const width = Math.max(2, String(count).length);
  const cutFileNames = count === 1 && !willMerge ? [filename]
    : Array.from({ length: count }, (_, index) => `${stem}_segment_${String(index + 1).padStart(width, '0')}.${extension}`);

  return {
    directory: getMediaOutputDir(sourcePath, 'lossless'),
    filename,
    cutFileNames,
  };
}

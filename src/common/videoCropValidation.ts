import type { CropExportRequest, CropOutputSettings, CropRect, CropTimeSegment } from './videoCropTypes.js';

export interface CropValidationProblem {
  field: string;
  message: string;
}

function positiveInteger(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0;
}

/** Validation is intentionally separate from UI drafts, so partial edits never blank the preview. */
export function validateCropRect(rect: CropRect, bounds: { width: number; height: number }): CropValidationProblem[] {
  const issues: CropValidationProblem[] = [];
  if (!Number.isSafeInteger(rect.x) || rect.x < 0) issues.push({ field: 'x', message: 'X must be a nonnegative integer' });
  if (!Number.isSafeInteger(rect.y) || rect.y < 0) issues.push({ field: 'y', message: 'Y must be a nonnegative integer' });
  if (!positiveInteger(rect.width)) issues.push({ field: 'width', message: 'Width must be a positive integer' });
  if (!positiveInteger(rect.height)) issues.push({ field: 'height', message: 'Height must be a positive integer' });
  if (!positiveInteger(bounds.width) || !positiveInteger(bounds.height)) {
    issues.push({ field: 'bounds', message: 'Invalid visible video dimensions' });
  } else if (issues.length === 0 && (rect.x + rect.width > bounds.width || rect.y + rect.height > bounds.height)) {
    issues.push({ field: 'rect', message: 'Crop region exceeds visible video boundaries' });
  }
  return issues;
}

/** Output dimensions describe real encoded pixels. Padding never changes the source crop. */
export function getCropEncodedDimensions({
  width, height, pixelFormat, padToCompatible,
}: {
  width: number;
  height: number;
  pixelFormat: CropOutputSettings['pixelFormat'];
  padToCompatible: boolean;
}) {
  if (!positiveInteger(width) || !positiveInteger(height)) throw new Error('Output dimensions must be positive integers');
  const modW = pixelFormat === 'yuv444p' ? 1 : 2;
  const modH = pixelFormat === 'yuv420p' ? 2 : 1;
  const paddedWidth = Math.ceil(width / modW) * modW;
  const paddedHeight = Math.ceil(height / modH) * modH;
  const needsPadding = paddedWidth !== width || paddedHeight !== height;
  if (needsPadding && !padToCompatible) throw new Error('Pixel format is incompatible with the requested output dimensions');
  return { width: padToCompatible ? paddedWidth : width, height: padToCompatible ? paddedHeight : height, needsPadding };
}

export function validateCropOutput(output: CropOutputSettings, crop: CropRect): CropValidationProblem[] {
  const issues: CropValidationProblem[] = [];
  const width = output.resize ? output.width : crop.width;
  const height = output.resize ? output.height : crop.height;
  if (!positiveInteger(width)) issues.push({ field: 'width', message: 'Output width must be a positive integer' });
  if (!positiveInteger(height)) issues.push({ field: 'height', message: 'Output height must be a positive integer' });
  if (!Number.isSafeInteger(output.crf) || output.crf < 0 || output.crf > 51) {
    issues.push({ field: 'crf', message: 'CRF must be between 0 and 51' });
  }
  if (output.timeRange !== 'selected' && output.timeRange !== 'entire') {
    issues.push({ field: 'timeRange', message: 'Unsupported crop time range' });
  }
  return issues;
}

function doTimeRangesOverlap(segments: readonly CropTimeSegment[]): boolean {
  const ordered = segments.toSorted((a, b) => a.start - b.start);
  return ordered.some((segment, index) => index > 0 && segment.start < ordered[index - 1]!.end);
}

/** The planner is pure: filesystem existence/overwrites are checked by Phase 3B. */
export function validateCropExportRequest(request: CropExportRequest): CropValidationProblem[] {
  const problems: CropValidationProblem[] = [];
  const { config, frame, sourceDuration, segments } = request;
  if (!request.sourcePath.trim()) problems.push({ field: 'sourcePath', message: 'Missing source video path' });
  if (!request.outputDir.trim()) problems.push({ field: 'outputDir', message: 'Missing output directory' });
  if (!Number.isSafeInteger(request.videoStreamIndex) || request.videoStreamIndex < 0) {
    problems.push({ field: 'videoStreamIndex', message: 'Invalid video stream index' });
  }
  if (request.audioStreamIndex != null && (!Number.isSafeInteger(request.audioStreamIndex) || request.audioStreamIndex < 0)) {
    problems.push({ field: 'audioStreamIndex', message: 'Invalid audio stream index' });
  }
  if (!positiveInteger(frame.width) || !positiveInteger(frame.height)) {
    problems.push({ field: 'frame', message: 'Invalid source video dimensions' });
  }
  if (!positiveInteger(frame.sarNum) || !positiveInteger(frame.sarDen)) {
    problems.push({ field: 'sar', message: 'Invalid sample aspect ratio' });
  }
  if (![0, 90, 180, 270].includes(frame.rotation)) {
    problems.push({ field: 'rotation', message: 'Unsupported source display orientation' });
  }
  const rotated = frame.rotation === 90 || frame.rotation === 270;
  problems.push(
    ...validateCropRect(config.rect, {
      width: rotated ? frame.height : frame.width,
      height: rotated ? frame.width : frame.height,
    }),
    ...validateCropOutput(config.output, config.rect),
  );
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    problems.push({ field: 'sourceDuration', message: 'Invalid source duration' });
  }
  if (!['mp4', 'mkv'].includes(config.output.format)) {
    problems.push({ field: 'format', message: 'Unsupported output container' });
  }
  if (!['merge', 'separate'].includes(config.output.outputMode)) {
    problems.push({ field: 'outputMode', message: 'Unsupported output mode' });
  }
  if (!['yuv420p', 'yuv422p', 'yuv444p'].includes(config.output.pixelFormat)) {
    problems.push({ field: 'pixelFormat', message: 'Unsupported output pixel format' });
  }
  // Only the reviewed CPU presets are available in Phase 3A/3B.
  const high = config.output.quality === 'high' && config.output.crf === 18;
  const standard = config.output.quality === 'standard' && config.output.crf === 23;
  if (!high && !standard) problems.push({ field: 'quality', message: 'Unsupported crop encoding preset' });
  if (config.output.encoder !== 'libx264' || config.output.preset !== 'medium' || config.output.pixelFormat !== 'yuv420p') {
    problems.push({ field: 'encoder', message: 'Only libx264 medium yuv420p is supported in this phase' });
  }
  if (segments.length === 0) {
    problems.push({ field: 'segments', message: 'No exportable segments selected' });
  }
  segments.forEach(({ start, end }, index) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > sourceDuration) {
      problems.push({ field: 'segments', message: `Invalid export segment at index ${index}` });
    }
  });
  if (config.output.outputMode === 'merge' && doTimeRangesOverlap(segments)) {
    problems.push({ field: 'segments', message: 'Overlapping segments cannot be merged' });
  }
  if (config.output.timeRange === 'entire' && (segments.length !== 1 || segments[0]?.start !== 0 || segments[0]?.end !== sourceDuration)) {
    problems.push({ field: 'segments', message: 'Entire video must cover the full source duration' });
  }
  return problems;
}


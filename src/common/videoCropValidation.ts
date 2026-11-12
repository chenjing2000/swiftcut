import type { CropOutputSettings, CropRect } from './videoCropTypes.js';

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

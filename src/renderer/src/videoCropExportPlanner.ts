import type { CropExportPlan, CropExportRequest, CropExportTask } from '../../common/videoCropTypes.js';
import { getMediaOutputName } from '../../common/mediaWorkspace.js';
import { getCropEncodedDimensions, validateCropExportRequest } from '../../common/videoCropValidation.js';

/** Pure, non-mutating planning; no FFmpeg launch or filesystem side effects. */
export function createCropExportPlan(request: CropExportRequest): CropExportPlan {
  const problems = validateCropExportRequest(request);
  if (problems.length > 0) throw new Error(problems.map(({ field, message }) => `${field}: ${message}`).join('; '));

  const { config, frame } = request;
  const { output } = config;
  const outputWidth = output.resize ? output.width : config.rect.width;
  const outputHeight = output.resize ? output.height : config.rect.height;
  const encoded = getCropEncodedDimensions({
    width: outputWidth, height: outputHeight, pixelFormat: output.pixelFormat, padToCompatible: true,
  });
  const sorted = request.segments.toSorted((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);
  const separate = output.outputMode === 'separate' && sorted.length > 1;
  const entire = output.timeRange === 'entire';
  const outputName = (mode: 'entire' | 'segment' | 'merge', segmentIndex?: number) => getMediaOutputName({
    sourcePath: request.sourcePath,
    kind: 'crop',
    mode,
    extension: output.format,
    ...(segmentIndex != null && { segmentIndex, segmentCount: sorted.length }),
  });
  const tasks: CropExportTask[] = sorted.map((segment, index) => ({
    start: segment.start,
    end: segment.end,
    originalIndex: segment.originalIndex,
    outputName: separate ? outputName('segment', index + 1) : outputName(entire ? 'entire' : 'segment', 1),
  }));

  const turned = frame.rotation === 90 || frame.rotation === 270;
  return {
    sourcePath: request.sourcePath,
    outputDir: request.outputDir,
    frame: { ...frame },
    videoStreamIndex: request.videoStreamIndex,
    ...(request.audioStreamIndex != null && { audioStreamIndex: request.audioStreamIndex }),
    crop: { ...config.rect },
    output: { ...output },
    outputWidth,
    outputHeight,
    encodedWidth: encoded.width,
    encodedHeight: encoded.height,
    outputSarNum: output.resize ? 1 : (turned ? frame.sarDen : frame.sarNum),
    outputSarDen: output.resize ? 1 : (turned ? frame.sarNum : frame.sarDen),
    tasks,
    ...(output.outputMode === 'merge' && sorted.length > 1 && { mergedOutputName: outputName('merge') }),
  };
}

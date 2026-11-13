import type { CropExportPlan, CropExportTask } from '../common/videoCropTypes.js';
import { formatFfmpegNumber } from '../common/util.js';

/** Pure FFmpeg argument builder. The caller owns temporary output paths and process execution. */
export function buildCropFfmpegArgs({
  plan, task, outputPath,
}: { plan: CropExportPlan; task: CropExportTask; outputPath: string }): string[] {
  if (!outputPath) throw new Error('Missing temporary output path');
  if (plan.tasks.every((candidate) => candidate.start !== task.start || candidate.end !== task.end
    || candidate.originalIndex !== task.originalIndex)) throw new Error('Unknown crop task');

  const { frame, crop, output } = plan;
  // Never rely on implicit metadata-based autorotation. Display-space coordinates
  // from Phase 2 are applied after the source's existing orientation is normalized.
  // FFprobe Display Matrix positive angles indicate counter-clockwise presentation.
  // For odd X/Y and subsampled input, upsample chroma before crop to preserve the luma origin.
  const filters: string[] = ['format=yuv444p'];
  switch (frame.rotation) {
    case 0: {
      break;
    }
    case 90: {
      filters.push('transpose=cclock');
      break;
    }
    case 180: {
      filters.push('hflip', 'vflip');
      break;
    }
    case 270: {
      filters.push('transpose=clock');
      break;
    }
    default: {
      break;
    }
  }
  filters.push(`crop=w=${crop.width}:h=${crop.height}:x=${crop.x}:y=${crop.y}:exact=1`);
  if (output.resize) filters.push(`scale=w=${plan.outputWidth}:h=${plan.outputHeight}:flags=lanczos`);
  if (plan.encodedWidth !== plan.outputWidth || plan.encodedHeight !== plan.outputHeight) {
    filters.push(`pad=w=${plan.encodedWidth}:h=${plan.encodedHeight}:x=0:y=0:color=black`);
  }
  filters.push(`setsar=${plan.outputSarNum}/${plan.outputSarDen}`, `format=${output.pixelFormat}`);

  const includeAudio = output.keepAudio && plan.audioStreamIndex != null;
  const args = [
    '-hide_banner', '-nostdin', '-noautorotate',
    // We rotate pixels explicitly below. Reset input Display Matrix so FFmpeg
    // does not propagate the original rotation side data into the encoded MP4.
    '-display_rotation', '0',
    '-i', plan.sourcePath,
    '-ss', formatFfmpegNumber(task.start),
    '-t', formatFfmpegNumber(task.end - task.start),
    '-map', `0:${plan.videoStreamIndex}`,
    ...(includeAudio ? ['-map', `0:${plan.audioStreamIndex}`] : []),
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-crf', String(output.crf), '-preset', output.preset,
    '-pix_fmt', output.pixelFormat,
    '-fps_mode:v', 'passthrough',
    ...(includeAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-metadata:s:v:0', 'rotate=0',
    '-f', output.format === 'mp4' ? 'mp4' : 'matroska',
    '-y', outputPath,
  ];
  return args;
}

import { resolve } from 'node:path';
import type { CropExportPlan } from '../common/videoCropTypes.js';

// FFmpeg concat demuxer uses single-quoted, backslash-escaped file paths.
export function buildCropConcatList(paths: readonly string[]): string {
  if (paths.length < 2) throw new Error('At least two segments are required for concatenation');
  return ['ffconcat version 1.0', ...paths.map((path) => {
    const escaped = resolve(path).replaceAll("'", "'\\''");
    return `file '${escaped}'`;
  }), ''].join('\n');
}

export function buildCropConcatArgs({ listPath, outputPath, plan }: {
  listPath: string;
  outputPath: string;
  plan: CropExportPlan;
}): string[] {
  if (!listPath || !outputPath) throw new Error('Missing crop concatenation path');
  return [
    '-hide_banner', '-nostdin',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-map', '0:v:0',
    ...(plan.output.keepAudio && plan.audioStreamIndex != null ? ['-map', '0:a:0'] : []),
    '-c', 'copy',
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-f', plan.output.format === 'mp4' ? 'mp4' : 'matroska',
    '-y', outputPath,
  ];
}

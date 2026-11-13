import type { FFprobeStream } from '../../common/ffprobe.js';

/** Resolve a source video's display orientation, without applying user rotation. */
export function getSourceDisplayRotation(stream: Pick<FFprobeStream, 'tags' | 'side_data_list'> | undefined): number | undefined {
  if (stream == null) return undefined;
  const matrix = stream.side_data_list?.find((item) => item.side_data_type === 'Display Matrix' && Number.isFinite(item.rotation));
  const raw = matrix?.rotation ?? (stream.tags?.rotate == null ? undefined : Number(stream.tags.rotate));
  if (raw == null || !Number.isFinite(raw)) return undefined;
  return ((raw % 360) + 360) % 360;
}

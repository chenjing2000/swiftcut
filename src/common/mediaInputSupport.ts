// Shared, side-effect-free input capability checks. FFprobe remains authoritative
// for actual streams; extensions only identify the supported common input set.
export const commonVideoExtensions = [
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpg', 'mpeg',
  'ts', 'm2ts', 'mts', 'wmv',
] as const;

export const commonAudioExtensions = [
  'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus',
  'wma', 'aif', 'aiff',
] as const;

export type MediaInputStream = { codec_type?: string; codec_name?: string };

const videoExtensions: ReadonlySet<string> = new Set(commonVideoExtensions);
const audioExtensions: ReadonlySet<string> = new Set(commonAudioExtensions);

export function getMediaInputExtension(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const filename = filePath.split(/[\\/]/u).at(-1) ?? '';
  return /\.([^.]+)$/u.exec(filename)?.[1]?.toLowerCase();
}

export function isCommonMediaInput(filePath: string | undefined): boolean {
  const ext = getMediaInputExtension(filePath);
  return ext != null && (videoExtensions.has(ext) || audioExtensions.has(ext));
}

export function canExtractAudio(filePath: string | undefined, streams: readonly MediaInputStream[]): boolean {
  return isCommonMediaInput(filePath) && streams.some((stream) => stream.codec_type === 'audio');
}

export function canCropVideo(filePath: string | undefined, streams: readonly MediaInputStream[]): boolean {
  const ext = getMediaInputExtension(filePath);
  return ext != null && videoExtensions.has(ext)
    && streams.some((stream) => stream.codec_type === 'video');
}

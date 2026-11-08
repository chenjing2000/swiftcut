export type Mp3Quality = 'vbr' | '320k' | '192k';

export type AudioExtractionMode = 'original' | 'mp3';

export interface OriginalAudioOutputFormat {
  extension: string;
  muxer: string;
}

const originalAudioOutputFormats: Record<string, OriginalAudioOutputFormat> = {
  aac: { extension: 'm4a', muxer: 'ipod' },
  mp3: { extension: 'mp3', muxer: 'mp3' },
  alac: { extension: 'm4a', muxer: 'ipod' },
  ac3: { extension: 'ac3', muxer: 'ac3' },
  eac3: { extension: 'eac3', muxer: 'eac3' },
  opus: { extension: 'opus', muxer: 'opus' },
};

export function getOriginalAudioOutputFormat(codecName: string): OriginalAudioOutputFormat {
  const normalizedCodecName = codecName.trim().toLowerCase();
  return originalAudioOutputFormats[normalizedCodecName] ?? { extension: 'mka', muxer: 'matroska' };
}

export interface AudioExtractionSegment {
  start: number;
  end?: number;
}

export interface AudioExtractionProbeInfo {
  format?: { format_name?: string; duration?: string };
  streams?: { index: number; codec_type?: string; codec_name?: string }[];
}

export interface AudioExtractionTask {
  segmentNumber: number;
  trackNumber: number;
  streamIndex: number;
  start: number;
  end?: number;
  outputSuffix: string;
}

/** Decode FFprobe buffered stdout as UTF-8 and parse its JSON payload. */
export function parseFfprobeJson(stdout: Uint8Array | string): AudioExtractionProbeInfo {
  const decoded = typeof stdout === 'string' ? stdout : new TextDecoder('utf-8').decode(stdout);
  const normalized = decoded.replace(/^\u{FEFF}/u, '').trim();
  const firstObject = normalized.indexOf('{');
  const lastObject = normalized.lastIndexOf('}');
  if (firstObject === -1 || lastObject < firstObject) {
    throw new Error(`FFprobe did not return JSON. Output: ${normalized.slice(0, 240) || '(empty)'}`);
  }

  const jsonText = normalized.slice(firstObject, lastObject + 1);
  try {
    return JSON.parse(jsonText) as AudioExtractionProbeInfo;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FFprobe returned invalid JSON: ${detail}. Output: ${jsonText.slice(0, 240)}`, { cause: error });
  }
}

export function normalizeAudioExtractionSegments(
  segments: readonly AudioExtractionSegment[],
  duration: number | undefined,
): AudioExtractionSegment[] {
  if (segments.length === 0) {
    return [{
      start: 0,
      ...(duration != null && Number.isFinite(duration) && duration > 0 && { end: duration }),
    }];
  }

  return segments.map(({ start, end }, index) => {
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end == null || end <= start) {
      throw new Error(`Invalid extraction segment ${index + 1}`);
    }

    if (duration != null && Number.isFinite(duration) && duration > 0) {
      if (start >= duration || end > duration + 0.25) {
        throw new Error(`Extraction segment ${index + 1} is outside the media duration`);
      }
      return { start, end: Math.min(end, duration) };
    }

    return { start, end };
  });
}

export function createAudioExtractionTasks({
  segments,
  selectedStreamIndexes,
  audioStreamIndexes,
}: {
  segments: readonly AudioExtractionSegment[];
  selectedStreamIndexes: readonly number[];
  audioStreamIndexes: readonly number[];
}): AudioExtractionTask[] {
  if (selectedStreamIndexes.length === 0) throw new Error('Select at least one audio track');
  if (new Set(selectedStreamIndexes).size !== selectedStreamIndexes.length) {
    throw new Error('Duplicate audio stream selection');
  }
  if (segments.length === 0) throw new Error('At least one extraction segment is required');

  const selectedTracks = selectedStreamIndexes.map((streamIndex) => {
    const trackIndex = audioStreamIndexes.indexOf(streamIndex);
    if (!Number.isSafeInteger(streamIndex) || trackIndex === -1) {
      throw new Error(`Selected stream ${streamIndex} is not an audio track`);
    }
    return { streamIndex, trackNumber: trackIndex + 1 };
  });

  return segments.flatMap((segment, segmentIndex) => selectedTracks.map(({ streamIndex, trackNumber }) => {
    const segmentNumber = segmentIndex + 1;
    const suffixParts = [
      ...(segments.length > 1 ? [`segment-${String(segmentNumber).padStart(2, '0')}`] : []),
      ...(selectedTracks.length > 1 ? [`track-${String(trackNumber).padStart(2, '0')}`] : []),
    ];

    return {
      segmentNumber,
      trackNumber,
      streamIndex,
      start: segment.start,
      ...(segment.end != null && { end: segment.end }),
      outputSuffix: suffixParts.length > 0 ? `_${suffixParts.join('_')}` : '',
    };
  }));
}

export function buildMp3FfmpegArgs({
  inputPath,
  streamIndex,
  quality,
  outputPath,
  segment,
}: {
  inputPath: string;
  streamIndex: number;
  quality: Mp3Quality;
  outputPath: string;
  segment?: AudioExtractionSegment;
}) {
  const args = ['-hide_banner', '-nostdin', '-n', '-i', inputPath];

  // Output-side seeking keeps the cut accurate after decoding from the preceding audio packet.
  if (segment?.start != null && segment.start > 0) args.push('-ss', String(segment.start));
  if (segment?.end != null) args.push('-t', String(segment.end - (segment.start ?? 0)));

  args.push('-map', `0:${streamIndex}`, '-vn', '-sn', '-dn', '-c:a', 'libmp3lame');
  if (quality === 'vbr') args.push('-q:a', '2');
  else args.push('-b:a', quality);
  args.push(outputPath);
  return args;
}

export function buildOriginalAudioFfmpegArgs({
  inputPath,
  streamIndex,
  outputFormat,
  outputPath,
  segment,
}: {
  inputPath: string;
  streamIndex: number;
  outputFormat: OriginalAudioOutputFormat;
  outputPath: string;
  segment?: AudioExtractionSegment;
}) {
  const args = ['-hide_banner', '-nostdin', '-n', '-i', inputPath];

  // Stream-copy seeking is packet-based and cannot guarantee sample-accurate segment boundaries.
  if (segment?.start != null && segment.start > 0) args.push('-ss', String(segment.start));
  if (segment?.end != null) args.push('-t', String(segment.end - (segment.start ?? 0)));

  args.push(
    '-map', `0:${streamIndex}`,
    '-vn', '-sn', '-dn',
    '-c:a', 'copy',
    '-f', outputFormat.muxer,
    outputPath,
  );
  return args;
}

/** Shared types for the independent, re-encoded Crop Video workflow. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropRotation = 0 | 90 | 180 | 270;
export type CropAspectPreset = 'free' | 'source' | '16:9' | '4:3' | '1:1' | '9:16';
export type CropTimeRange = 'selected' | 'entire';
export type CropOutputMode = 'merge' | 'separate';
export type CropOutputFormat = 'mp4' | 'mkv';
export type CropQuality = 'high' | 'standard' | 'custom';

export interface CropOutputSettings {
  resize: boolean;
  width: number;
  height: number;
  lockAspect: boolean;
  quality: CropQuality;
  encoder: 'libx264' | 'libx265';
  crf: number;
  preset: 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow' | 'slower';
  pixelFormat: 'yuv420p' | 'yuv422p' | 'yuv444p';
  format: CropOutputFormat;
  keepAudio: boolean;
  timeRange: CropTimeRange;
  outputMode: CropOutputMode;
}

export interface CropTimeSegment {
  start: number;
  end: number;
  originalIndex: number;
}

export interface CropVideoConfig {
  rect: CropRect;
  aspectPreset: CropAspectPreset;
  output: CropOutputSettings;
}

/** Immutable description of a crop export, prepared before launching FFmpeg. */
export interface CropExportFrame {
  width: number;
  height: number;
  /** Source display orientation; this is metadata compatibility, not a rotation tool. */
  rotation: CropRotation;
  sarNum: number;
  sarDen: number;
}

export interface CropExportRequest {
  sourcePath: string;
  outputDir: string;
  frame: CropExportFrame;
  videoStreamIndex: number;
  audioStreamIndex?: number;
  sourceDuration: number;
  config: CropVideoConfig;
  /** Already-resolved selected or inverse time ranges, in source seconds. */
  segments: readonly CropTimeSegment[];
}

export interface CropExportTask {
  start: number;
  end: number;
  originalIndex: number;
  outputName: string;
}

export interface CropExportPlan {
  sourcePath: string;
  outputDir: string;
  frame: CropExportFrame;
  videoStreamIndex: number;
  audioStreamIndex?: number;
  crop: CropRect;
  output: CropOutputSettings;
  outputWidth: number;
  outputHeight: number;
  encodedWidth: number;
  encodedHeight: number;
  /** Keep visible-frame SAR for unscaled output; resized output uses square pixels. */
  outputSarNum: number;
  outputSarDen: number;
  tasks: readonly CropExportTask[];
  mergedOutputName?: string;
}

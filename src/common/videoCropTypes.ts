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

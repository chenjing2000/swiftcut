import type { CropAspectPreset, CropRect, CropRotation } from '../../common/videoCropTypes';

/** Pixel-edge coordinates, not pixel centers. The visible image is the source of truth. */
export interface CropFrameGeometry {
  width: number;
  height: number;
  rotation: CropRotation;
  sarNum: number;
  sarDen: number;
}

export interface CropViewport {
  left: number;
  top: number;
  width: number;
  height: number;
  fit: 'contain' | 'cover' | 'fill';
}

export interface CropPoint { x: number; y: number }
export interface CropDisplayTransform {
  displayWidth: number;
  displayHeight: number;
  drawnLeft: number;
  drawnTop: number;
  drawnWidth: number;
  drawnHeight: number;
}

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}`);
}

export function getCropVisibleSize(frame: CropFrameGeometry) {
  assertPositiveFinite(frame.width, 'frame width');
  assertPositiveFinite(frame.height, 'frame height');
  assertPositiveFinite(frame.sarNum, 'SAR numerator');
  assertPositiveFinite(frame.sarDen, 'SAR denominator');
  const rotated = frame.rotation === 90 || frame.rotation === 270;
  return { width: rotated ? frame.height : frame.width, height: rotated ? frame.width : frame.height };
}

/** Effective sample aspect ratio in the visible, rotated pixel grid. */
export function getCropVisibleSar(frame: CropFrameGeometry) {
  assertPositiveFinite(frame.sarNum, 'SAR numerator');
  assertPositiveFinite(frame.sarDen, 'SAR denominator');
  return frame.rotation === 90 || frame.rotation === 270
    ? frame.sarDen / frame.sarNum : frame.sarNum / frame.sarDen;
}

export function getCropDisplayTransform(frame: CropFrameGeometry, viewport: CropViewport): CropDisplayTransform {
  const visible = getCropVisibleSize(frame);
  assertPositiveFinite(viewport.width, 'viewport width');
  assertPositiveFinite(viewport.height, 'viewport height');
  const displayWidth = visible.width * getCropVisibleSar(frame);
  const displayHeight = visible.height;
  const sx = viewport.width / displayWidth;
  const sy = viewport.height / displayHeight;
  const scaleX = viewport.fit === 'fill' ? sx : viewport.fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const scaleY = viewport.fit === 'fill' ? sy : scaleX;
  const drawnWidth = displayWidth * scaleX;
  const drawnHeight = displayHeight * scaleY;
  return {
    displayWidth, displayHeight, drawnWidth, drawnHeight,
    drawnLeft: viewport.left + (viewport.width - drawnWidth) / 2,
    drawnTop: viewport.top + (viewport.height - drawnHeight) / 2,
  };
}

/** The output point is expressed in rotated visible-image pixel-edge coordinates. */
export function screenToCropPoint(screen: CropPoint, frame: CropFrameGeometry, viewport: CropViewport): CropPoint | undefined {
  const layout = getCropDisplayTransform(frame, viewport);
  const { width, height } = getCropVisibleSize(frame);
  const x = (screen.x - layout.drawnLeft) * width / layout.drawnWidth;
  const y = (screen.y - layout.drawnTop) * height / layout.drawnHeight;

  // Floating-point layout arithmetic can put an exact edge a tiny fraction
  // outside the frame. Snap only values within numerical noise of an edge;
  // do not clamp genuinely out-of-bounds pointer positions into the video.
  const epsilon = 1e-9;
  if (x < -epsilon || y < -epsilon || x > width + epsilon || y > height + epsilon) return undefined;
  const snapEdge = (value: number, upper: number) => {
    if (Math.abs(value) <= epsilon) return 0;
    if (Math.abs(value - upper) <= epsilon) return upper;
    return value;
  };
  return { x: snapEdge(x, width), y: snapEdge(y, height) };
}

export function cropPointToScreen(point: CropPoint, frame: CropFrameGeometry, viewport: CropViewport): CropPoint {
  const layout = getCropDisplayTransform(frame, viewport);
  const visible = getCropVisibleSize(frame);
  return {
    x: layout.drawnLeft + point.x * layout.drawnWidth / visible.width,
    y: layout.drawnTop + point.y * layout.drawnHeight / visible.height,
  };
}

/** Transforms a corner of the rotated visible pixel grid into the unrotated decoded frame. */
export function visibleToFramePoint({ x, y }: CropPoint, frame: CropFrameGeometry): CropPoint {
  switch (frame.rotation) {
    case 0: return { x, y };
    case 90: return { x: y, y: frame.height - x };
    case 180: return { x: frame.width - x, y: frame.height - y };
    case 270: return { x: frame.width - y, y: x };
  }
}

/** A visible rect's corners must all transform: rotations move the rectangle's origin. */
export function visibleRectToFrameRect(rect: CropRect, frame: CropFrameGeometry): CropRect {
  const points = [
    visibleToFramePoint({ x: rect.x, y: rect.y }, frame),
    visibleToFramePoint({ x: rect.x + rect.width, y: rect.y }, frame),
    visibleToFramePoint({ x: rect.x, y: rect.y + rect.height }, frame),
    visibleToFramePoint({ x: rect.x + rect.width, y: rect.y + rect.height }, frame),
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function isValidCropRect(rect: CropRect, frame: CropFrameGeometry) {
  const visible = getCropVisibleSize(frame);
  return Object.values(rect).every(Number.isSafeInteger)
    && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
    && rect.x + rect.width <= visible.width && rect.y + rect.height <= visible.height;
}

export function getCropTargetAspect(preset: CropAspectPreset, frame: CropFrameGeometry): number | undefined {
  if (preset === 'free') return undefined;
  if (preset === 'source') {
    const { width, height } = getCropVisibleSize(frame);
    return width * getCropVisibleSar(frame) / height;
  }
  const [w, h] = preset.split(':').map(Number);
  if (!w || !h) throw new Error('Unsupported crop ratio');
  return w / h;
}

/**
 * Resolve an exact theoretical aspect into an integer visible-pixel rectangle.
 * The actively edited dimension is retained; only the dependent one is snapped.
 * Ties use the smaller integer. No intermediate rounding is performed.
 * If the dependent dimension does not fit, the active dimension shrinks to fit
 * while preserving the anchored top-left corner.
 */
export function alignCropSize({
  rect, frame, aspect, primary,
}: { rect: CropRect; frame: CropFrameGeometry; aspect: number; primary: 'width' | 'height' }): CropRect {
  assertPositiveFinite(aspect, 'aspect');
  if (!Number.isSafeInteger(rect.x) || !Number.isSafeInteger(rect.y) || rect.x < 0 || rect.y < 0) {
    throw new Error('Crop origin must use nonnegative integer pixels');
  }
  const visible = getCropVisibleSize(frame);
  const availableWidth = visible.width - rect.x;
  const availableHeight = visible.height - rect.y;
  if (availableWidth < 1 || availableHeight < 1) throw new Error('Crop origin outside frame');
  const sar = getCropVisibleSar(frame);
  const nearest = (value: number) => Math.ceil(value - 0.5);
  let width: number;
  let height: number;
  if (primary === 'width') {
    width = Math.min(Math.max(1, Math.trunc(rect.width)), availableWidth);
    height = nearest(width * sar / aspect);
    while (width > 1 && (height < 1 || height > availableHeight)) {
      width -= 1;
      height = nearest(width * sar / aspect);
    }
  } else {
    height = Math.min(Math.max(1, Math.trunc(rect.height)), availableHeight);
    width = nearest(height * aspect / sar);
    while (height > 1 && (width < 1 || width > availableWidth)) {
      height -= 1;
      width = nearest(height * aspect / sar);
    }
  }
  if (width < 1 || height < 1 || width > availableWidth || height > availableHeight) {
    throw new Error('Aspect ratio cannot fit a valid crop rectangle');
  }
  return { x: rect.x, y: rect.y, width, height };
}

/** Strip non-ASCII digits on both typing and paste. Empty drafts are allowed. */
export const sanitizeCropDigits = (text: string) => text.replace(/[^0-9]/g, '');

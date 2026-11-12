import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

import type { CropAspectPreset, CropOutputMode, CropRect, CropTimeRange } from '../../../../common/videoCropTypes.js';
import { validateCropRect } from '../../../../common/videoCropValidation.js';
import { alignCropSize, cropPointToScreen, getCropDisplayTransform, getCropTargetAspect, getCropVisibleSize, sanitizeCropDigits, screenToCropPoint } from '../../videoCropGeometry';
import type { CropFrameGeometry, CropViewport } from '../../videoCropGeometry';
import { getDefaultCropTimeRange } from '../../videoCropSegments';
import type { CropSourceSegment } from '../../videoCropSegments';

import styles from './VideoCropWorkspace.module.css';

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  frame: CropFrameGeometry;
  videoFit: CropViewport['fit'];
  segments: readonly CropSourceSegment[];
  duration: number;
  onClose: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onPreviewChange: (rect: { left: number; top: number; width: number; height: number } | undefined) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const aspectOptions: { value: CropAspectPreset; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'source', label: 'Source ratio' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
];

const makeFullRect = (frame: CropFrameGeometry): CropRect => {
  const visible = getCropVisibleSize(frame);
  return { x: 0, y: 0, width: visible.width, height: visible.height };
};

function CropNumericField({ label, value, onCommit, disabled = false }: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  // Undefined means display the latest committed value without a syncing effect.
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    const next = Number(draft);
    if (draft && Number.isSafeInteger(next)) onCommit(next);
    setDraft(undefined);
  };

  return (
    <div className={styles['numberField']}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => setDraft(sanitizeCropDigits(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(undefined);
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
      />
    </div>
  );
}

export default function VideoCropWorkspace({ containerRef, frame, videoFit, segments, duration, onClose, fullscreen, onToggleFullscreen, onPreviewChange }: Props) {
  type Handle = 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
  type Dimension = 'x' | 'y' | 'width' | 'height';
  const { t } = useTranslation();
  const fullRect = useMemo(() => makeFullRect(frame), [frame]);
  const [rect, setRect] = useState<CropRect>(fullRect);
  const [ratio, setRatio] = useState<CropAspectPreset>('free');
  const [resize, setResize] = useState(false);
  const [lockResizeAspect, setLockResizeAspect] = useState(true);
  const [resizeWidth, setResizeWidth] = useState(fullRect.width);
  const [resizeHeight, setResizeHeight] = useState(fullRect.height);
  const [timeRange, setTimeRange] = useState<CropTimeRange>(() => getDefaultCropTimeRange(segments, duration));
  const [outputMode, setOutputMode] = useState<CropOutputMode>('merge');
  const [keepAudio, setKeepAudio] = useState(true);
  const [format, setFormat] = useState<'mp4' | 'mkv'>('mp4');
  const [quality, setQuality] = useState('high');
  const [previewMode, setPreviewMode] = useState<'edit' | 'output'>('edit');
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [panelPosition, setPanelPosition] = useState(() => {
    const videoBounds = containerRef.current?.getBoundingClientRect();
    return {
      left: Math.max(8, (videoBounds?.right ?? window.innerWidth) - 396),
      top: Math.max(8, (videoBounds?.top ?? 0) + 48),
    };
  });
  const [focused, setFocused] = useState(false);
  const panelDragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | undefined>(undefined);
  const pointerDragRef = useRef<{ x: number; y: number; rect: CropRect; mode: Handle } | undefined>(undefined);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  const clampPanel = useCallback((left: number, top: number) => {
    const root = document.getElementById('app-root');
    const bounds = root?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const width = panelRef.current?.offsetWidth ?? 380;
    const height = panelRef.current?.offsetHeight ?? 250;
    const margin = 8;
    return {
      left: clamp(left, bounds.left + margin, Math.max(bounds.left + margin, bounds.right - width - margin)),
      top: clamp(top, bounds.top + margin, Math.max(bounds.top + margin, bounds.bottom - height - margin)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setPanelPosition((previous) => clampPanel(previous.left, previous.top));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPanel]);

  const stopPanelDrag = useCallback((pointerId?: number, revert = false) => {
    const drag = panelDragRef.current;
    if (!drag || (pointerId != null && drag.pointerId !== pointerId)) return;
    panelDragRef.current = undefined;
    const heading = headingRef.current;
    if (heading?.hasPointerCapture(drag.pointerId)) heading.releasePointerCapture(drag.pointerId);
    if (revert) setPanelPosition(clampPanel(drag.left, drag.top));
  }, [clampPanel]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [containerRef]);

  const viewport = useMemo<CropViewport>(() => ({
    left: 0, top: 0, width: Math.max(1, size.width), height: Math.max(1, size.height), fit: videoFit,
  }), [size, videoFit]);
  const layout = useMemo(() => getCropDisplayTransform(frame, viewport), [frame, viewport]);
  const bounds = getCropVisibleSize(frame);
  const valid = validateCropRect(rect, bounds).length === 0;
  const displayRect = useMemo(() => {
    const a = cropPointToScreen({ x: rect.x, y: rect.y }, frame, viewport);
    const b = cropPointToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, frame, viewport);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }, [rect, frame, viewport]);

  useEffect(() => {
    onPreviewChange(previewMode === 'output' ? displayRect : undefined);
    return () => onPreviewChange(undefined);
  }, [displayRect, onPreviewChange, previewMode]);

  const changeRect = useCallback((next: CropRect, dimension: Dimension) => {
    let candidate = next;
    const aspect = getCropTargetAspect(ratio, frame);
    if (aspect != null && (dimension === 'width' || dimension === 'height')) {
      try { candidate = alignCropSize({ rect: next, frame, aspect, primary: dimension }); } catch { return; }
    }
    if (validateCropRect(candidate, getCropVisibleSize(frame)).length === 0) {
      setRect(candidate);
      if (!resize) {
        setResizeWidth(candidate.width);
        setResizeHeight(candidate.height);
      }
    }
  }, [frame, ratio, resize]);

  const updateDimension = (dimension: Dimension, value: number) => {
    changeRect({ ...rect, [dimension]: value }, dimension);
  };

  const changeResizeDimension = (dimension: 'width' | 'height', value: number) => {
    if (value <= 0) return;
    const aspect = rect.width / rect.height;
    if (dimension === 'width') {
      setResizeWidth(value);
      if (lockResizeAspect) setResizeHeight(Math.max(1, Math.floor((value / aspect) + 0.5)));
    } else {
      setResizeHeight(value);
      if (lockResizeAspect) setResizeWidth(Math.max(1, Math.floor((value * aspect) + 0.5)));
    }
  };

  const getPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const boundsRect = containerRef.current?.getBoundingClientRect();
    if (!boundsRect) return undefined;
    return screenToCropPoint({ x: event.clientX - boundsRect.left, y: event.clientY - boundsRect.top }, frame, viewport);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1 || previewMode !== 'edit') return;
    const point = getPoint(event);
    if (!point) return;
    const handle = (event.target as HTMLElement).dataset['cropHandle'] as Handle | undefined;
    const mode: Handle = handle ?? 'draw';
    pointerDragRef.current = { x: Math.round(point.x), y: Math.round(point.y), rect, mode };
    surfaceRef.current?.setPointerCapture(event.pointerId);
    setFocused(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    const point = getPoint(event);
    if (!point) return;
    const x = clamp(Math.round(point.x), 0, bounds.width);
    const y = clamp(Math.round(point.y), 0, bounds.height);
    const dx = x - drag.x;
    const dy = y - drag.y;
    let next = drag.rect;
    const { mode } = drag;
    if (mode === 'draw') {
      next = { x: Math.min(drag.x, x), y: Math.min(drag.y, y), width: Math.abs(dx), height: Math.abs(dy) };
    } else if (mode === 'move') {
      next = { ...next, x: clamp(next.x + dx, 0, bounds.width - next.width), y: clamp(next.y + dy, 0, bounds.height - next.height) };
    } else {
      let left = drag.rect.x;
      let top = drag.rect.y;
      let right = left + drag.rect.width;
      let bottom = top + drag.rect.height;
      if (mode.includes('w')) left = clamp(left + dx, 0, right - 1);
      if (mode.includes('e')) right = clamp(right + dx, left + 1, bounds.width);
      if (mode.includes('n')) top = clamp(top + dy, 0, bottom - 1);
      if (mode.includes('s')) bottom = clamp(bottom + dy, top + 1, bounds.height);
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }
    if (next.width <= 0 || next.height <= 0) return;
    const aspect = getCropTargetAspect(ratio, frame);
    if (aspect != null || event.shiftKey) {
      const wanted = aspect ?? ((drag.rect.width * (frame.sarNum / frame.sarDen)) / drag.rect.height);
      try { next = alignCropSize({ rect: next, frame, aspect: wanted, primary: Math.abs(dx) >= Math.abs(dy) ? 'width' : 'height' }); } catch { return; }
    }
    if (validateCropRect(next, bounds).length === 0) {
      setRect(next);
      if (!resize) {
        setResizeWidth(next.width);
        setResizeHeight(next.height);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDragRef.current = undefined;
    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) surfaceRef.current.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (panelDragRef.current && event.key === 'Escape') {
        stopPanelDrag(undefined, true);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        if (fullscreen) return; // Let Chromium exit the native video fullscreen.
        if (pointerDragRef.current) pointerDragRef.current = undefined;
        else onClose();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!focused || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const delta = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? delta : 0);
      const dy = event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? delta : 0);
      setRect((previous) => ({
        ...previous,
        x: clamp(previous.x + dx, 0, bounds.width - previous.width),
        y: clamp(previous.y + dy, 0, bounds.height - previous.height),
      }));
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () => document.removeEventListener('keydown', keydown, { capture: true });
  }, [bounds.height, bounds.width, focused, fullscreen, onClose, stopPanelDrag]);

  const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handleStyles: Record<string, CSSProperties> = {
    nw: { left: 0, top: 0 },
    n: { left: '50%', top: 0 },
    ne: { left: '100%', top: 0 },
    e: { left: '100%', top: '50%' },
    se: { left: '100%', top: '100%' },
    s: { left: '50%', top: '100%' },
    sw: { left: 0, top: '100%' },
    w: { left: 0, top: '50%' },
  };
  const multiple = timeRange === 'selected' && segments.filter((segment) => segment.selected && !segment.initial && segment.end != null && segment.end > segment.start).length > 1;

  return (
    <>
      {previewMode === 'edit' && (
        <div className={styles['overlay']}>
          <div
            ref={surfaceRef}
            className={styles['surface']}
            style={{
              left: layout.drawnLeft,
              top: layout.drawnTop,
              width: layout.drawnWidth,
              height: layout.drawnHeight,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.dataset['cropHandle'] && target.dataset['cropHandle'] !== 'move') return;
              pointerDragRef.current = undefined;
              onToggleFullscreen();
              event.stopPropagation();
            }}
            role="presentation"
          >
            <div
              className={styles['selection']}
              data-crop-handle="move"
              style={{
                ...displayRect,
                left: displayRect.left - layout.drawnLeft,
                top: displayRect.top - layout.drawnTop,
              }}
            >
              {handles.map((handle) => (
                <span key={handle} data-crop-handle={handle} className={styles['handle']} style={handleStyles[handle]} />
              ))}
            </div>
          </div>
        </div>
      )}
      {createPortal(
        <section
          ref={panelRef}
          aria-label={t('Crop Video Settings')}
          className={styles['panel']}
          style={{ left: panelPosition.left, top: panelPosition.top, visibility: fullscreen ? 'hidden' : undefined, pointerEvents: fullscreen ? 'none' : undefined }}
          onPointerDown={() => setFocused(false)}
        >
          <div
            ref={headingRef}
            className={styles['heading']}
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target !== event.currentTarget && (event.target as HTMLElement).closest('button'))) return;
              panelDragRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: panelPosition.left,
                top: panelPosition.top,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const drag = panelDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              if ((event.buttons & 1) === 0) {
                stopPanelDrag(event.pointerId);
                return;
              }
              setPanelPosition(clampPanel(
                drag.left + event.clientX - drag.x,
                drag.top + event.clientY - drag.y,
              ));
            }}
            onPointerUp={(event) => stopPanelDrag(event.pointerId)}
            onPointerCancel={(event) => stopPanelDrag(event.pointerId)}
            onLostPointerCapture={(event) => stopPanelDrag(event.pointerId)}
            role="presentation"
          >
            <strong>{t('Crop Video Settings')}</strong>
            <button type="button" aria-label={t('Close')} onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button>
          </div>
          <div className={styles['contents']}>
            <div className={styles['sectionTitle']}>
              <strong>{t('Crop Region')}</strong>
              <button type="button" onClick={() => { setRect(fullRect); if (!resize) { setResizeWidth(fullRect.width); setResizeHeight(fullRect.height); } }}>{t('Reset')}</button>
            </div>
            <div className={styles['coordinateGrid']}>
              <CropNumericField label="X" value={rect.x} onCommit={(value) => updateDimension('x', value)} />
              <CropNumericField label="Y" value={rect.y} onCommit={(value) => updateDimension('y', value)} />
              <CropNumericField label="W" value={rect.width} onCommit={(value) => updateDimension('width', value)} />
              <CropNumericField label="H" value={rect.height} onCommit={(value) => updateDimension('height', value)} />
            </div>
            <label className={styles['row']} htmlFor="crop-aspect-ratio"><span>{t('Aspect ratio')}</span>
              <select
                id="crop-aspect-ratio"
                value={ratio}
                onChange={(event) => {
                  const preset = event.target.value as CropAspectPreset;
                  const aspect = getCropTargetAspect(preset, frame);
                  setRatio(preset);
                  if (aspect != null) {
                    try {
                      const aligned = alignCropSize({ rect, frame, aspect, primary: 'width' });
                      setRect(aligned);
                      if (!resize) {
                        setResizeWidth(aligned.width);
                        setResizeHeight(aligned.height);
                      }
                    } catch {
                      // Keep the last valid integer crop while the ratio cannot fit.
                    }
                  }
                }}
              >
                {aspectOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
              </select>
            </label>
            <strong>{t('Output Size')}</strong>
            <label className={styles['radio']} htmlFor="crop-original-size"><input id="crop-original-size" name="crop-output-size" type="radio" checked={!resize} onChange={() => setResize(false)} />{t('Original crop size')}</label>
            <div className={styles['resizeRow']}>
              <label className={styles['radio']} htmlFor="crop-resize"><input id="crop-resize" name="crop-output-size" type="radio" checked={resize} onChange={() => setResize(true)} />{t('Resize to:')}</label>
              <CropNumericField label="W" disabled={!resize} value={resize ? resizeWidth : rect.width} onCommit={(value) => changeResizeDimension('width', value)} />
              <CropNumericField label="H" disabled={!resize} value={resize ? resizeHeight : rect.height} onCommit={(value) => changeResizeDimension('height', value)} />
            </div>
            {resize && <label className={styles['checkbox']} htmlFor="crop-resize-lock"><input id="crop-resize-lock" type="checkbox" checked={lockResizeAspect} onChange={(event) => setLockResizeAspect(event.target.checked)} />{t('Lock aspect ratio')}</label>}
            <strong>{t('Video Quality')}</strong>
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="high">{t('High quality')} · H.264 CRF 18</option>
              <option value="standard">{t('Standard')} · H.264 CRF 23</option>
              <option value="custom">{t('Custom (Phase 3)')}</option>
            </select>
            <strong>{t('Export')}</strong>
            <label className={styles['row']} htmlFor="crop-time-range"><span>{t('Time range')}</span>
              <select id="crop-time-range" value={timeRange} onChange={(event) => setTimeRange(event.target.value as CropTimeRange)}>
                <option value="selected">{t('Selected segments')}</option>
                <option value="entire">{t('Entire video')}</option>
              </select>
            </label>
            <label className={styles['row']} htmlFor="crop-output-mode"><span>{t('Output mode')}</span>
              <select id="crop-output-mode" value={outputMode} disabled={!multiple} onChange={(event) => setOutputMode(event.target.value as CropOutputMode)}>
                <option value="merge">{t('Merge into one file')}</option>
                <option value="separate">{t('Export separately')}</option>
              </select>
            </label>
            <label className={styles['checkbox']} htmlFor="crop-keep-audio"><input id="crop-keep-audio" type="checkbox" checked={keepAudio} onChange={(event) => setKeepAudio(event.target.checked)} />{t('Keep Audio')}</label>
            <label className={styles['row']} htmlFor="crop-format"><span>{t('Output format')}</span>
              <select id="crop-format" value={format} onChange={(event) => setFormat(event.target.value as 'mp4' | 'mkv')}>
                <option value="mp4">MP4</option><option value="mkv">MKV</option>
              </select>
            </label>
            <div className={styles['footer']}>
              <span className={styles['phaseNote']}>{t('Export encoding is available in Phase 3')}</span>
              <button type="button" onClick={onClose}>{t('Cancel')}</button>
              <button type="button" disabled title={t('Export encoding is available in Phase 3')}>{t('Export Video')}</button>
            </div>
            <div className={styles['previewRow']}>
              <button type="button" aria-pressed={previewMode === 'edit'} onClick={() => setPreviewMode('edit')}>{t('Edit Selection')}</button>
              <button type="button" aria-pressed={previewMode === 'output'} onClick={() => setPreviewMode('output')}>{t('Preview Output')}</button>
            </div>
            {!valid && <p>{t('Invalid crop region')}</p>}
          </div>
        </section>,
      document.getElementById('app-root') ?? document.body,
      )}
    </>
  );
}

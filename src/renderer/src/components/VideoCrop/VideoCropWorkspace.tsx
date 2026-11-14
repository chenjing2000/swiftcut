import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CropAspectPreset, CropOutputMode, CropRect, CropTimeRange, CropVideoConfig } from '../../../../common/videoCropTypes.js';
import { validateCropRect } from '../../../../common/videoCropValidation.js';
import { alignCropSize, cropPointToScreen, getCropDisplayTransform, getCropTargetAspect, getCropVisibleSize, screenToCropPoint } from '../../videoCropGeometry';
import type { CropFrameGeometry, CropViewport } from '../../videoCropGeometry';
import { getDefaultCropTimeRange } from '../../videoCropSegments';
import type { CropSourceSegment } from '../../videoCropSegments';

import styles from './VideoCropWorkspace.module.css';
import OutputFloatingPanel from '../OutputFloatingPanel';
import { isActiveOutputPanel } from '../outputPanelFocus';
import actionStyles from '../OutputActionButtons.module.css';
import CropNumericField from './CropNumericField';
import VideoCropSelectionOverlay from './VideoCropSelectionOverlay';

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  frame: CropFrameGeometry;
  videoFit: CropViewport['fit'];
  segments: readonly CropSourceSegment[];
  selectedSegmentCount: number;
  duration: number;
  onClose: () => void;
  onExport: (config: CropVideoConfig) => Promise<void>;
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

export default function VideoCropWorkspace({ containerRef, frame, videoFit, segments, selectedSegmentCount, duration, onClose, onExport, fullscreen, onToggleFullscreen, onPreviewChange }: Props) {
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
  const [timeRange, setTimeRange] = useState<CropTimeRange>(() => (selectedSegmentCount > 0 ? 'selected' : getDefaultCropTimeRange(segments, duration)));
  const [outputMode, setOutputMode] = useState<CropOutputMode>('merge');
  const [keepAudio, setKeepAudio] = useState(true);
  const [format, setFormat] = useState<'mp4' | 'mkv'>('mp4');
  const [quality, setQuality] = useState('high');
  const [submitting, setSubmitting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const [previewMode, setPreviewMode] = useState<'edit' | 'output'>('edit');
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [focused, setFocused] = useState(false);
  const pointerDragRef = useRef<{ x: number; y: number; rect: CropRect; mode: Handle } | undefined>(undefined);
  const surfaceRef = useRef<HTMLDivElement>(null);
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
    const onPointerDownInsideSettings = (event: PointerEvent) => {
      if (event.target instanceof Element
        && event.target.closest('[role="dialog"][data-output-panel="crop"]')) {
        setFocused(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDownInsideSettings, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDownInsideSettings, { capture: true });
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!isActiveOutputPanel('crop')) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
        || event.target instanceof HTMLTextAreaElement) return;
      if (!focused || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const delta = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -delta : (event.key === 'ArrowRight' ? 1 : 0);
      const dy = event.key === 'ArrowUp' ? -delta : (event.key === 'ArrowDown' ? 1 : 0);
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
  }, [bounds.height, bounds.width, focused]);

  const multiple = timeRange === 'selected' && selectedSegmentCount > 1;

  const submitExport = async () => {
    if (submitting || !valid || quality === 'custom') return;
    setExportError(undefined);
    setSubmitting(true);
    try {
      await onExport({
        rect: { ...rect },
        aspectPreset: ratio,
        output: {
          resize,
          width: resize ? resizeWidth : rect.width,
          height: resize ? resizeHeight : rect.height,
          lockAspect: lockResizeAspect,
          quality: quality === 'standard' ? 'standard' : 'high',
          encoder: 'libx264',
          crf: quality === 'standard' ? 23 : 18,
          preset: 'medium',
          pixelFormat: 'yuv420p',
          format,
          keepAudio,
          timeRange,
          outputMode,
        },
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {previewMode === 'edit' && (
        <VideoCropSelectionOverlay
          surfaceRef={surfaceRef}
          layout={layout}
          displayRect={displayRect}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.dataset['cropHandle'] && target.dataset['cropHandle'] !== 'move') return;
            pointerDragRef.current = undefined;
            onToggleFullscreen();
            event.stopPropagation();
          }}
        />
      )}
      <OutputFloatingPanel
        id="crop"
        open
        title={t('Crop Video Settings')}
        onClose={onClose}
        hidden={fullscreen}
        contentClassName={styles['contents']}
        ignoreEscapeFromInputs
        onEscape={() => {
          if (fullscreen) return 'ignore';
          if (pointerDragRef.current) {
            pointerDragRef.current = undefined;
            return 'handled';
          }
          return undefined;
        }}
        footer={(
          <>
          <button className={actionStyles['action']} type="button" onClick={onClose}>{t('Cancel')}</button>
          <button className={`${actionStyles['action']} ${actionStyles['primary']}`} type="button" disabled={!valid || submitting || quality === 'custom' || (timeRange === 'selected' && selectedSegmentCount === 0)} onClick={() => { submitExport().catch(console.error); }}>{t('Export')}</button>
        </>
        )}
      >
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
        <label className={styles['qualityRow']} htmlFor="crop-quality"><strong>{t('Video Quality')}</strong>
          <select id="crop-quality" value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="high">{t('High quality')} · H.264 CRF 18</option>
            <option value="standard">{t('Standard')} · H.264 CRF 23</option>
            <option value="custom" disabled>{t('Custom (Phase 3)')}</option>
          </select>
        </label>
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
        <div className={styles['previewRow']}>
          <button type="button" aria-pressed={previewMode === 'edit'} onClick={() => setPreviewMode('edit')}>{t('Edit Selection')}</button>
          <button type="button" aria-pressed={previewMode === 'output'} onClick={() => setPreviewMode('output')}>{t('Preview Output')}</button>
        </div>
        {!valid && <p role="alert">{t('Invalid crop region')}</p>}
        {exportError && <p role="alert">{exportError}</p>}
      </OutputFloatingPanel>
    </>
  );
}

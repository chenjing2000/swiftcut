import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CropAspectPreset, CropOutputMode, CropRect, CropTimeRange } from '../../../../common/videoCropTypes.js';
import { validateCropRect } from '../../../../common/videoCropValidation.js';
import { alignCropSize, cropPointToScreen, getCropDisplayTransform, getCropTargetAspect, getCropVisibleSize, sanitizeCropDigits, screenToCropPoint } from '../../videoCropGeometry';
import type { CropFrameGeometry, CropViewport } from '../../videoCropGeometry';
import { getDefaultCropTimeRange } from '../../videoCropSegments';
import type { CropSourceSegment } from '../../videoCropSegments';

import styles from './VideoCropWorkspace.module.css';

type Handle = 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
type Dimension = 'x' | 'y' | 'width' | 'height';

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  frame: CropFrameGeometry;
  videoFit: CropViewport['fit'];
  segments: readonly CropSourceSegment[];
  duration: number;
  onClose: () => void;
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

function CropNumericField({ label, value, onCommit }: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commit = () => {
    setEditing(false);
    const next = Number(draft);
    if (draft && Number.isSafeInteger(next)) onCommit(next);
    else setDraft(String(value));
  };

  return (
    <label className={styles.numberField}>
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(sanitizeCropDigits(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(String(value));
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
      />
    </label>
  );
}

export default function VideoCropWorkspace({ containerRef, frame, videoFit, segments, duration, onClose, onPreviewChange }: Props) {
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
  const [panelPosition, setPanelPosition] = useState({ right: 16, top: 48 });
  const [focused, setFocused] = useState(false);
  const panelDrag = useRef<{ x: number; y: number; top: number; right: number } | undefined>(undefined);
  const pointerDrag = useRef<{ x: number; y: number; rect: CropRect; mode: Handle } | undefined>(undefined);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    setRect(fullRect);
    setResizeWidth(fullRect.width);
    setResizeHeight(fullRect.height);
  }, [fullRect]);

  const viewport = useMemo<CropViewport>(() => ({
    left: 0, top: 0, width: Math.max(1, size.width), height: Math.max(1, size.height), fit: videoFit,
  }), [size, videoFit]);
  const layout = useMemo(() => getCropDisplayTransform(frame, viewport), [frame, viewport]);
  const bounds = getCropVisibleSize(frame);
  const valid = validateCropRect(rect, bounds).length === 0;
  const displayRect = useMemo(() => {
    const a = cropPointToScreen({ x: rect.x, y: rect.y }, frame, viewport);
    const b = cropPointToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, frame, viewport);
    return { left: a.x - layout.drawnLeft, top: a.y - layout.drawnTop, width: b.x - a.x, height: b.y - a.y };
  }, [rect, frame, viewport, layout.drawnLeft, layout.drawnTop]);

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
    if (validateCropRect(candidate, getCropVisibleSize(frame)).length === 0) setRect(candidate);
  }, [frame, ratio]);

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
    if (event.button !== 0 || previewMode !== 'edit') return;
    const point = getPoint(event);
    if (!point) return;
    const handle = (event.target as HTMLElement).dataset.cropHandle as Handle | undefined;
    const mode: Handle = handle ?? 'draw';
    pointerDrag.current = { x: Math.round(point.x), y: Math.round(point.y), rect, mode };
    surfaceRef.current?.setPointerCapture(event.pointerId);
    setFocused(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointerDrag.current;
    if (!drag) return;
    const point = getPoint(event);
    if (!point) return;
    const x = clamp(Math.round(point.x), 0, bounds.width);
    const y = clamp(Math.round(point.y), 0, bounds.height);
    const dx = x - drag.x;
    const dy = y - drag.y;
    let next = drag.rect;
    const mode = drag.mode;
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
    if (validateCropRect(next, bounds).length === 0) setRect(next);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDrag.current = undefined;
    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) surfaceRef.current.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        if (pointerDrag.current) pointerDrag.current = undefined;
        else onClose();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!focused || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const delta = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
      const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
      setRect((previous) => ({
        ...previous,
        x: clamp(previous.x + dx, 0, bounds.width - previous.width),
        y: clamp(previous.y + dy, 0, bounds.height - previous.height),
      }));
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [bounds.height, bounds.width, focused, onClose]);

  const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handleStyles: Record<string, CSSProperties> = {
    nw: { left: 0, top: 0 }, n: { left: '50%', top: 0 }, ne: { left: '100%', top: 0 },
    e: { left: '100%', top: '50%' }, se: { left: '100%', top: '100%' }, s: { left: '50%', top: '100%' },
    sw: { left: 0, top: '100%' }, w: { left: 0, top: '50%' },
  };
  const multiple = timeRange === 'selected' && segments.filter((segment) => segment.selected && !segment.initial && segment.end != null && segment.end > segment.start).length > 1;

  return (
    <>
      {previewMode === 'edit' && <div className={styles.overlay}>
        <div
          ref={surfaceRef}
          className={styles.surface}
          style={{
            left: layout.drawnLeft, top: layout.drawnTop,
            width: layout.drawnWidth, height: layout.drawnHeight,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="presentation"
        >
          <div className={styles.selection} data-crop-handle="move" style={displayRect}>
            {handles.map((handle) => (
              <span key={handle} data-crop-handle={handle} className={styles.handle} style={handleStyles[handle]} />
            ))}
          </div>
        </div>
      </div>}
      <section
        ref={panelRef}
        aria-label={t('Crop Video')}
        className={styles.panel}
        style={{ top: panelPosition.top, right: panelPosition.right }}
        onPointerDown={() => setFocused(false)}
      >
        <div
          className={styles.heading}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            panelDrag.current = { x: event.clientX, y: event.clientY, top: panelPosition.top, right: panelPosition.right };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = panelDrag.current;
            if (!drag) return;
            const panelWidth = panelRef.current?.offsetWidth ?? 380;
            const panelHeight = panelRef.current?.offsetHeight ?? 200;
            setPanelPosition({
              top: clamp(drag.top + event.clientY - drag.y, 0, Math.max(0, size.height - panelHeight)),
              right: clamp(drag.right - (event.clientX - drag.x), 0, Math.max(0, size.width - panelWidth)),
            });
          }}
          onPointerUp={() => { panelDrag.current = undefined; }}
          role="presentation"
        >
          <strong>{t('Crop Video')}</strong>
          <button type="button" aria-label={t('Close')} onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button>
        </div>
        <div className={styles.contents}>
          <div className={styles.sectionTitle}>
            <strong>{t('Crop Region')}</strong>
            <button type="button" onClick={() => { setRect(fullRect); if (!resize) { setResizeWidth(fullRect.width); setResizeHeight(fullRect.height); } }}>{t('Reset')}</button>
          </div>
          <div className={styles.coordinateGrid}>
            <CropNumericField label="X" value={rect.x} onCommit={(value) => updateDimension('x', value)} />
            <CropNumericField label="Y" value={rect.y} onCommit={(value) => updateDimension('y', value)} />
            <CropNumericField label="W" value={rect.width} onCommit={(value) => updateDimension('width', value)} />
            <CropNumericField label="H" value={rect.height} onCommit={(value) => updateDimension('height', value)} />
          </div>
          <label className={styles.row}><span>{t('Aspect ratio')}</span>
            <select value={ratio} onChange={(event) => setRatio(event.target.value as CropAspectPreset)}>
              {aspectOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </label>
          <strong>{t('Output Size')}</strong>
          <label className={styles.radio}><input type="radio" checked={!resize} onChange={() => setResize(false)} />{t('Original crop size')}</label>
          <div className={styles.resizeRow}>
            <label className={styles.radio}><input type="radio" checked={resize} onChange={() => { setResize(true); setResizeWidth(rect.width); setResizeHeight(rect.height); }} />{t('Resize to:')}</label>
            <CropNumericField label="W" value={resize ? resizeWidth : rect.width} onCommit={(value) => changeResizeDimension('width', value)} />
            <CropNumericField label="H" value={resize ? resizeHeight : rect.height} onCommit={(value) => changeResizeDimension('height', value)} />
          </div>
          {resize && <label className={styles.checkbox}><input type="checkbox" checked={lockResizeAspect} onChange={(event) => setLockResizeAspect(event.target.checked)} />{t('Lock aspect ratio')}</label>}
          <strong>{t('Video Quality')}</strong>
          <select value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="high">{t('High quality')} · H.264 CRF 18</option>
            <option value="standard">{t('Standard')} · H.264 CRF 23</option>
            <option value="custom">{t('Custom (Phase 3)')}</option>
          </select>
          <strong>{t('Export')}</strong>
          <label className={styles.row}><span>{t('Time range')}</span>
            <select value={timeRange} onChange={(event) => setTimeRange(event.target.value as CropTimeRange)}>
              <option value="selected">{t('Selected segments')}</option>
              <option value="entire">{t('Entire video')}</option>
            </select>
          </label>
          <label className={styles.row}><span>{t('Output mode')}</span>
            <select value={outputMode} disabled={!multiple} onChange={(event) => setOutputMode(event.target.value as CropOutputMode)}>
              <option value="merge">{t('Merge into one file')}</option>
              <option value="separate">{t('Export separately')}</option>
            </select>
          </label>
          <label className={styles.checkbox}><input type="checkbox" checked={keepAudio} onChange={(event) => setKeepAudio(event.target.checked)} />{t('Keep Audio')}</label>
          <label className={styles.row}><span>{t('Output format')}</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as 'mp4' | 'mkv')}>
              <option value="mp4">MP4</option><option value="mkv">MKV</option>
            </select>
          </label>
          <div className={styles.footer}>
            <span className={styles.phaseNote}>{t('Export encoding is available in Phase 3')}</span>
            <button type="button" onClick={onClose}>{t('Cancel')}</button>
            <button type="button" disabled title={t('Export encoding is available in Phase 3')}>{t('Export Video')}</button>
          </div>
          <div className={styles.previewRow}>
            <button type="button" aria-pressed={previewMode === 'edit'} onClick={() => setPreviewMode('edit')}>{t('Edit Selection')}</button>
            <button type="button" aria-pressed={previewMode === 'output'} onClick={() => setPreviewMode('output')}>{t('Preview Output')}</button>
          </div>
          {!valid && <p>{t('Invalid crop region')}</p>}
        </div>
      </section>
    </>
  );
}

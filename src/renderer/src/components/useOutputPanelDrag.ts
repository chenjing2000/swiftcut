import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getOutputProgressPosition, setOutputProgressPosition } from './outputProgressPositionStore';
import type { ProgressWindowId } from './outputProgressPositionStore';

interface Position { left: number; top: number }
interface DragStart extends Position { x: number; y: number; pointerId: number }

export type OutputPanelPlacement = 'top-right' | 'bottom-right';

export default function useOutputPanelDrag(panelRef: RefObject<HTMLElement | null>, placement: OutputPanelPlacement = 'top-right', progressId?: ProgressWindowId) {
  // A progress panel starts with CSS bottom/right placement until its actual
  // dimensions can be measured. This prevents a wrong first-frame position.
  const [position, setPosition] = useState<Position | undefined>(() => {
    if (progressId) return getOutputProgressPosition(progressId);
    if (placement === 'bottom-right') return undefined;
    return { left: Math.max(8, window.innerWidth - 396), top: 48 };
  });
  const resetPosition = useCallback(() => {
    if (placement === 'bottom-right') {
      const saved = progressId ? getOutputProgressPosition(progressId) : undefined;
      if (saved) {
        setPosition(saved);
        return;
      }
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ left: rect.left, top: rect.top });
      return;
    }
    setPosition({ left: Math.max(8, window.innerWidth - 396), top: 48 });
  }, [panelRef, placement, progressId]);
  useEffect(() => {
    if (progressId && position) setOutputProgressPosition(progressId, position);
  }, [position, progressId]);

  const dragRef = useRef<DragStart | undefined>(undefined);
  const headingRef = useRef<HTMLDivElement>(null);

  const clampPosition = useCallback((left: number, top: number) => {
    const bounds = document.getElementById('app-root')?.getBoundingClientRect()
      ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const width = panelRef.current?.offsetWidth ?? 380;
    const height = panelRef.current?.offsetHeight ?? 250;
    const margin = 8;
    return {
      left: Math.max(bounds.left + margin, Math.min(left, Math.max(bounds.left + margin, bounds.right - width - margin))),
      top: Math.max(bounds.top + margin, Math.min(top, Math.max(bounds.top + margin, bounds.bottom - height - margin))),
    };
  }, [panelRef]);

  useEffect(() => {
    const onResize = () => setPosition((current) => {
      if (current == null) return current;
      return clampPosition(current.left, current.top);
    });
    window.addEventListener('resize', onResize);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onResize);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [clampPosition, panelRef]);

  const stopDrag = useCallback((pointerId?: number, revert = false) => {
    const { current } = dragRef;
    if (!current || (pointerId != null && current.pointerId !== pointerId)) return;
    dragRef.current = undefined;
    const { current: heading } = headingRef;
    if (heading?.hasPointerCapture(current.pointerId)) heading.releasePointerCapture(current.pointerId);
    if (revert) setPosition(clampPosition(current.left, current.top));
  }, [clampPosition]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [panelRef]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const { current } = dragRef;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.buttons % 2 === 0) {
      stopDrag(event.pointerId);
      return;
    }
    setPosition(clampPosition(current.left + event.clientX - current.x, current.top + event.clientY - current.y));
  }, [clampPosition, stopDrag]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    stopDrag(event.pointerId);
  }, [stopDrag]);

  return { position, resetPosition, dragRef, headingRef, stopDrag, onPointerDown, onPointerMove, onPointerUp };
}

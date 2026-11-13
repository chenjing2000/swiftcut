import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

/** Shared title-bar dragging for centered Radix dialogs. */
export default function useCenteredDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | undefined>(undefined);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !(event.target as HTMLElement).closest('[data-dialog-drag-handle]')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const { current } = dragRef;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    setOffset({
      x: clamp(current.offsetX + event.clientX - current.x, offset.x + 8 - rect.left, offset.x + window.innerWidth - rect.width - rect.left - 8),
      y: clamp(current.offsetY + event.clientY - current.y, offset.y + 8 - rect.top, offset.y + window.innerHeight - rect.height - rect.top - 8),
    });
  }, [offset]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { offset, onPointerDown, onPointerMove, onPointerUp };
}

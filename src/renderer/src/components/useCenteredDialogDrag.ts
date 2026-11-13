import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

/** Shared title-bar dragging for centered Radix dialogs. */
export default function useCenteredDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | undefined>(undefined);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !(event.target as HTMLElement).closest('[data-dialog-drag-handle]')) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const { width, height } = event.currentTarget.getBoundingClientRect();
    const maxX = Math.max(0, (window.innerWidth - width) / 2 - 8);
    const maxY = Math.max(0, (window.innerHeight - height) / 2 - 8);
    const clamp = (n: number, max: number) => Math.max(-max, Math.min(max, n));
    setOffset({
      x: clamp(current.offsetX + event.clientX - current.x, maxX),
      y: clamp(current.offsetY + event.clientY - current.y, maxY),
    });
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { offset, onPointerDown, onPointerMove, onPointerUp };
}

import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import styles from './VideoCropWorkspace.module.css';

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const handleStyles: Record<(typeof handles)[number], CSSProperties> = {
  nw: { left: 0, top: 0 },
  n: { left: '50%', top: 0 },
  ne: { left: '100%', top: 0 },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: 0, top: '100%' },
  w: { left: 0, top: '50%' },
};

export default function VideoCropSelectionOverlay({
  surfaceRef,
  layout,
  displayRect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  layout: { drawnLeft: number; drawnTop: number; drawnWidth: number; drawnHeight: number };
  displayRect: { left: number; top: number; width: number; height: number };
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className={styles['overlay']} data-output-panel="crop">
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
        onDoubleClick={onDoubleClick}
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
  );
}

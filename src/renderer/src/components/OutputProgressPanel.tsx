import type { FocusEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import styles from './VideoCrop/CropExportProgress.module.css';
import useOutputPanelDrag from './useOutputPanelDrag';
import useOutputProgressAutoDismiss from './useOutputProgressAutoDismiss';
import {
  getOutputPanelZIndex, getOutputPanelsRevision, registerOutputPanel, subscribeOutputPanels,
} from './outputPanelFocus';
import type { OutputPanel } from './outputPanelFocus';

interface Props {
  id: Extract<OutputPanel, `${string}-progress`>;
  title: ReactNode;
  label: ReactNode;
  state?: string | undefined;
  ariaLabel: string;
  testId?: string | undefined;
  children: ReactNode;
  autoDismiss?: boolean | undefined;
  onDismiss?: (() => void) | undefined;
}

/** Only owns window positioning and focus; export jobs own their lifecycle. */
export default function OutputProgressPanel({
  id, title, label, state, ariaLabel, testId, children, autoDismiss = false, onDismiss,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const {
    position, resetPosition, headingRef, onPointerDown, onPointerMove, onPointerUp,
  } = useOutputPanelDrag(panelRef, 'bottom-right', id);
  const fading = useOutputProgressAutoDismiss(autoDismiss, hovered || focused || dragging, () => onDismiss?.());
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  useSyncExternalStore(subscribeOutputPanels, getOutputPanelsRevision);

  useLayoutEffect(() => {
    const unregister = registerOutputPanel(id);
    resetPosition();
    return unregister;
  }, [id, resetPosition]);

  return createPortal(
    <aside
      ref={panelRef}
      className={styles['panel']}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      tabIndex={-1}
      data-output-panel={id}
      data-testid={testId}
      data-state={state}
      data-fading={fading ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={onBlur}
      style={{
        top: position?.top,
        left: position?.left,
        right: position == null ? 16 : 'auto',
        bottom: position == null ? 16 : 'auto',
        zIndex: getOutputPanelZIndex(id),
      }}
    >
      <div
        ref={headingRef}
        className={styles['heading']}
        onPointerDown={(event) => {
          if (event.button === 0) {
            setDragging(true);
            onPointerDown(event);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => { onPointerUp(event); setDragging(false); }}
        onPointerCancel={(event) => { onPointerUp(event); setDragging(false); }}
        onLostPointerCapture={(event) => { onPointerUp(event); setDragging(false); }}
      >
        <strong>{title}</strong>
        <span className={styles['status']} data-state={state}>{label}</span>
      </div>
      {children}
    </aside>,
    document.getElementById('app-root') ?? document.body,
  );
}

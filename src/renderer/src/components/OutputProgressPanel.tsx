import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import styles from './VideoCrop/CropExportProgress.module.css';
import useOutputPanelDrag from './useOutputPanelDrag';
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
}

/** Only owns window positioning and focus; export jobs own their lifecycle. */
export default function OutputProgressPanel({
  id, title, label, state, ariaLabel, testId, children,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const {
    position, resetPosition, headingRef, onPointerDown, onPointerMove, onPointerUp,
  } = useOutputPanelDrag(panelRef, 'bottom-right');

  useSyncExternalStore(subscribeOutputPanels, getOutputPanelsRevision);

  useLayoutEffect(() => {
    const unregister = registerOutputPanel(id);
    resetPosition();
    panelRef.current?.focus();
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        <strong>{title}</strong>
        <span className={styles['status']} data-state={state}>{label}</span>
      </div>
      {children}
    </aside>,
    document.getElementById('app-root') ?? document.body,
  );
}

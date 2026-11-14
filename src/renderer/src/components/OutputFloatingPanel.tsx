import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import chrome from './OutputPanelChrome.module.css';
import useOutputPanelDrag from './useOutputPanelDrag';
import {
  getOutputPanelZIndex, getOutputPanelsRevision, isActiveOutputPanel,
  registerOutputPanel, subscribeOutputPanels,
} from './outputPanelFocus';
import type { OutputPanel } from './outputPanelFocus';

interface Props {
  id: OutputPanel;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: CSSProperties['width'];
  className?: string;
  contentClassName?: string;
  hidden?: boolean;
  // Return 'handled' when a feature consumes Escape, or 'ignore' when
  // the browser (e.g. video fullscreen) should process it instead.
  onEscape?: () => 'handled' | 'ignore' | void;
  ignoreEscapeFromInputs?: boolean;
}

export default function OutputFloatingPanel({
  id, open, title, onClose, children, footer, width, className, contentClassName,
  hidden = false, onEscape, ignoreEscapeFromInputs = false,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    position, resetPosition, headingRef,
    onPointerDown, onPointerMove, onPointerUp,
  } = useOutputPanelDrag(panelRef);

  useSyncExternalStore(subscribeOutputPanels, getOutputPanelsRevision);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const unregister = registerOutputPanel(id);
    resetPosition();
    panelRef.current?.focus();
    return unregister;
  }, [id, open, resetPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isActiveOutputPanel(id)) return;
      const otherDialog = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (otherDialog && !(otherDialog as HTMLElement).dataset['outputPanel']) return;
      if (ignoreEscapeFromInputs && (event.target instanceof HTMLInputElement
        || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement)) return;

      const result = onEscape?.();
      if (result === 'ignore') return;
      if (result !== 'handled') onClose();
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () => document.removeEventListener('keydown', keydown, { capture: true });
  }, [id, ignoreEscapeFromInputs, onClose, onEscape, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      aria-modal="false"
      aria-label={title}
      data-output-panel={id}
      className={[chrome['panel'], className].filter(Boolean).join(' ')}
      style={{
        width,
        top: position.top,
        left: position.left,
        zIndex: getOutputPanelZIndex(id),
        visibility: hidden ? 'hidden' : undefined,
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      <div
        ref={headingRef}
        className={chrome['heading']}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        <h2 className={chrome['title']}>{title}</h2>
        <button type="button" aria-label={t('Close')} onClick={onClose}>×</button>
      </div>
      <div className={[chrome['contents'], contentClassName].filter(Boolean).join(' ')}>{children}</div>
      <div className={chrome['footer']}>{footer}</div>
    </div>,
    document.getElementById('app-root') ?? document.body,
  );
}

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './ExportSheet.module.css';
import chrome from './OutputPanelChrome.module.css';
import useOutputPanelDrag from './useOutputPanelDrag';
import actionStyles from './OutputActionButtons.module.css';
import { isActiveOutputPanel, registerOutputPanel } from './outputPanelFocus';

function ExportSheet({
  visible,
  children,
  renderBottom,
  renderButton,
  onClosePress,
  title,
  width,
}: {
  visible: boolean,
  renderBottom?: (() => ReactNode | null) | undefined,
  renderButton: () => ReactNode | null,
  children: ReactNode,
  onClosePress: () => void,
  title: string,
  width: CSSProperties['width'],
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const { position, resetPosition, headingRef, onPointerDown, onPointerMove, onPointerUp } = useOutputPanelDrag(panelRef);

  // ExportSheet stays mounted while hidden, so reset only when reopened.
  useEffect(() => {
    if (visible) resetPosition();
  }, [visible, resetPosition]);

  useEffect(() => {
    if (!visible) return undefined;
    return registerOutputPanel('lossless');
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isActiveOutputPanel('lossless')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClosePress();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [visible, onClosePress]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className={`${chrome['panel']} ${styles['panel']}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-output-panel="lossless"
      style={{
        width,
        top: position.top,
        left: position.left,
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
        <strong>{title}</strong>
        <button type="button" onClick={onClosePress} aria-label={t('Close')}>×</button>
      </div>
      <div className={`${chrome['contents']} ${styles['contents']}`}>{children}</div>
      <div className={chrome['footer']}>
        {renderBottom?.()}
        <button className={actionStyles['action']} type="button" onClick={onClosePress}>{t('Cancel')}</button>
        {renderButton()}
      </div>
    </div>
  );
}

export default ExportSheet;

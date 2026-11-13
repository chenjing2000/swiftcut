import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './ExportSheet.module.css';

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
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const dragRef = useRef<{ x: number; y: number; left: number; top: number }>();
  const panelRef = useRef<HTMLDivElement>(null);

  const clampPosition = useCallback((left: number, top: number) => {
    const widthValue = panelRef.current?.offsetWidth ?? 380;
    const heightValue = panelRef.current?.offsetHeight ?? 300;
    return {
      left: Math.max(8, Math.min(left, window.innerWidth - widthValue - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - heightValue - 8)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setPosition((current) => current == null ? current : clampPosition(current.left, current.top));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPosition]);

  const onHeaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onHeaderPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition(clampPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y));
  }, [clampPosition]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className={styles['panel']}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{
        width,
        ...(position == null ? { top: 8, right: 8 } : { top: position.top, left: position.left }),
      }}
    >
      <div
        className={styles['heading']}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={() => { dragRef.current = undefined; }}
        onPointerCancel={() => { dragRef.current = undefined; }}
        onLostPointerCapture={() => { dragRef.current = undefined; }}
      >
        <strong>{title}</strong>
        <button type="button" onClick={onClosePress} aria-label={t('Close')}>×</button>
      </div>
      <div className={styles['contents']}>{children}</div>
      <div className={styles['footer']}>
        {renderBottom?.()}
        <button type="button" onClick={onClosePress}>{t('Cancel')}</button>
        {renderButton()}
      </div>
    </div>
  );
}

export default ExportSheet;

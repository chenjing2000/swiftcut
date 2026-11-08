import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaQuestionCircle, FaTimesCircle } from 'react-icons/fa';

import * as AlertDialog from '../components/AlertDialog';
import * as Dialog from '../components/Dialog';
import { DialogButton } from '../components/Button';
import mainApi from '../mainApi';
import {
  completeActiveNotification,
  getNotificationSnapshot,
  subscribeNotificationStore,
} from './notificationStore';
import type { NotificationAction, NotificationMessage, NotificationType } from './notificationStore';

import styles from './NotificationHost.module.css';

function NotificationIcon({ type }: { type: NotificationType }) {
  const commonProps = { className: styles.icon, 'data-type': type, 'aria-hidden': true as const };
  switch (type) {
    case 'success':
      return <FaCheckCircle {...commonProps} />;
    case 'warning':
      return <FaExclamationTriangle {...commonProps} />;
    case 'error':
      return <FaTimesCircle {...commonProps} />;
    case 'confirmation':
      return <FaQuestionCircle {...commonProps} />;
    case 'information':
    default:
      return <FaInfoCircle {...commonProps} />;
  }
}

function isBlocking(message: NotificationMessage | undefined) {
  return message?.type === 'error' || message?.type === 'confirmation';
}

export default function NotificationHost() {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(subscribeNotificationStore, getNotificationSnapshot, getNotificationSnapshot);
  const active = snapshot.active;
  const blocking = isBlocking(active);
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(5000);
  const hoveredRef = useRef(false);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const beginExit = useCallback(() => {
    setPhase('exiting');
    timerRef.current = setTimeout(() => completeActiveNotification(), 600);
  }, []);

  const startHoldTimer = useCallback(() => {
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(beginExit, remainingRef.current);
  }, [beginExit]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDetailsExpanded(false);
    remainingRef.current = 5000;
    hoveredRef.current = false;

    if (!active || blocking) {
      setPhase('visible');
      return undefined;
    }

    setPhase('entering');
    timerRef.current = setTimeout(() => {
      setPhase('visible');
      if (!hoveredRef.current) startHoldTimer();
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active?.id, blocking, startHoldTimer]);

  const handleMouseEnter = () => {
    hoveredRef.current = true;
    if (!blocking && phase === 'visible' && timerRef.current) {
      clearTimeout(timerRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    }
  };

  const handleMouseLeave = () => {
    hoveredRef.current = false;
    if (!blocking && phase === 'visible') startHoldTimer();
  };

  const handleAction = (action: NotificationAction) => completeActiveNotification(action);

  const handleCopyDetails = () => {
    if (active?.details) void mainApi.writeClipboardText(active.details);
  };

  const handleOpenAutoFocus = (event: Event) => {
    if (active?.focusPrimary) {
      event.preventDefault();
      primaryButtonRef.current?.focus();
    }
  };

  if (!active) return null;

  if (blocking) {
    const isConfirmation = active.type === 'confirmation';
    const primaryLabel = active.primaryActionLabel ?? (isConfirmation ? t('Confirm') : t('OK'));
    const secondaryLabel = active.secondaryActionLabel ?? (isConfirmation ? t('Cancel') : undefined);

    return (
      <AlertDialog.Root open onOpenChange={() => undefined}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay />
          <AlertDialog.Content
            className={styles.modalContent}
            style={{ width: active.type === 'error' ? 480 : 440, maxWidth: '90vw' }}
            onOpenAutoFocus={handleOpenAutoFocus}
          >
            <div className={styles.modalHeading}>
              <NotificationIcon type={active.type} />
              <AlertDialog.Title className={styles.title}>{active.title ?? (isConfirmation ? t('Please confirm') : t('Error'))}</AlertDialog.Title>
            </div>
            <AlertDialog.Description className={styles.message}>{active.message}</AlertDialog.Description>

            {active.details && (
              <details className={styles.details} open={detailsExpanded} onToggle={(event) => setDetailsExpanded(event.currentTarget.open)}>
                <summary>{t('Show technical details')}</summary>
                <pre className={styles.detailsText}>{active.details}</pre>
                <button type="button" className={styles.copyButton} onClick={handleCopyDetails}>{t('Copy details')}</button>
              </details>
            )}

            <Dialog.ButtonRow>
              {secondaryLabel && (
                <DialogButton onClick={() => handleAction('cancel')}>{secondaryLabel}</DialogButton>
              )}
              <DialogButton
                primary
                ref={primaryButtonRef}
                onClick={() => handleAction(isConfirmation ? 'confirm' : 'acknowledge')}
              >
                {primaryLabel}
              </DialogButton>
            </Dialog.ButtonRow>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    );
  }

  return (
    <div className={styles.toastLayer} aria-live="polite" aria-atomic="true">
      <div
        className={styles.toastCard}
        data-type={active.type}
        data-phase={phase}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="status"
      >
        <div className={styles.toastHeading}>
          <NotificationIcon type={active.type} />
          {active.title && <div className={styles.title}>{active.title}</div>}
        </div>
        <div className={styles.message}>{active.message}</div>
      </div>
    </div>
  );
}

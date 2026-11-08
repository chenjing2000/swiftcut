import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  const commonProps = { className: styles['icon'], 'data-type': type, 'aria-hidden': true as const };
  switch (type) {
    case 'success': {
      return <FaCheckCircle {...commonProps} />;
    }
    case 'warning': {
      return <FaExclamationTriangle {...commonProps} />;
    }
    case 'error': {
      return <FaTimesCircle {...commonProps} />;
    }
    case 'confirmation': {
      return <FaQuestionCircle {...commonProps} />;
    }
    case 'information': {
      return <FaInfoCircle {...commonProps} />;
    }
  }
}

function isBlocking(message: NotificationMessage | undefined) {
  if (!message) return false;
  const { type } = message;
  return type === 'error' || type === 'confirmation';
}

export default function NotificationHost() {
  const { t } = useTranslation();
  type NotificationPhase = 'entering' | 'visible' | 'exiting';
  const { active } = useSyncExternalStore(subscribeNotificationStore, getNotificationSnapshot, getNotificationSnapshot);
  const activeId = active?.id;
  const blocking = isBlocking(active);
  const [phaseState, setPhaseState] = useState<{ id: string, value: Exclude<NotificationPhase, 'entering'> }>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(5000);
  const hoveredRef = useRef(false);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const isResolvingRef = useRef(false);
  const phase: NotificationPhase = activeId != null && phaseState?.id === activeId ? phaseState.value : 'entering';

  const beginExit = useCallback((id: string) => {
    setPhaseState({ id, value: 'exiting' });
    timerRef.current = setTimeout(() => completeActiveNotification(), 600);
  }, []);

  const startHoldTimer = useCallback((id: string) => {
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => beginExit(id), remainingRef.current);
  }, [beginExit]);

  useLayoutEffect(() => {
    isResolvingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current = 5000;
    hoveredRef.current = false;

    if (activeId == null || blocking) return undefined;

    timerRef.current = setTimeout(() => {
      setPhaseState({ id: activeId, value: 'visible' });
      if (!hoveredRef.current) startHoldTimer(activeId);
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeId, blocking, startHoldTimer]);

  const handleMouseEnter = () => {
    hoveredRef.current = true;
    if (!blocking && phase === 'visible' && timerRef.current) {
      clearTimeout(timerRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    }
  };

  const handleMouseLeave = () => {
    hoveredRef.current = false;
    if (!blocking && phase === 'visible' && activeId != null) startHoldTimer(activeId);
  };

  const handleAction = (action: NotificationAction) => {
    if (!activeId || isResolvingRef.current) return;
    isResolvingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhaseState({ id: activeId, value: 'exiting' });
    timerRef.current = setTimeout(() => completeActiveNotification(action), 600);
  };

  const handleCopyDetails = () => {
    if (active?.details) {
      mainApi.writeClipboardText(active.details).catch((error: unknown) => console.error('Failed to copy notification details', error));
    }
  };

  const handleOpenAutoFocus = (event: Event) => {
    if (active?.focusPrimary || active?.type === 'error') {
      event.preventDefault();
      primaryButtonRef.current?.focus();
    }
  };

  if (!active) return null;

  if (blocking) {
    const isConfirmation = active.type === 'confirmation';
    const defaultTitle = t(isConfirmation ? 'Please confirm' : 'Error');
    const primaryLabel = active.primaryActionLabel ?? t(isConfirmation ? 'Confirm' : 'OK');
    const secondaryLabel = active.secondaryActionLabel ?? (isConfirmation ? t('Cancel') : undefined);
    const modalWidth = active.type === 'error' ? 480 : 440;

    return (
      <AlertDialog.Root key={active.id} open onOpenChange={() => undefined}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles['modalOverlay']} data-phase={phase} />
          <AlertDialog.Content
            className={styles['modalContent']}
            data-phase={phase}
            style={{ width: modalWidth, minWidth: 'min(320px, 90vw)', maxWidth: '90vw' }}
            onOpenAutoFocus={handleOpenAutoFocus}
          >
            <div className={styles['modalHeading']}>
              <NotificationIcon type={active.type} />
              <AlertDialog.Title className={styles['title']}>{active.title ?? defaultTitle}</AlertDialog.Title>
            </div>
            <AlertDialog.Description className={styles['message']}>{active.message}</AlertDialog.Description>

            {active.details && (
              <details className={styles['details']}>
                <summary>{t('Show technical details')}</summary>
                <pre className={styles['detailsText']}>{active.details}</pre>
                <button type="button" className={styles['copyButton']} onClick={handleCopyDetails}>{t('Copy details')}</button>
              </details>
            )}

            <Dialog.ButtonRow>
              {secondaryLabel && (
                <AlertDialog.Cancel asChild>
                  <DialogButton onClick={() => handleAction('cancel')}>{secondaryLabel}</DialogButton>
                </AlertDialog.Cancel>
              )}
              <AlertDialog.Action asChild>
                <DialogButton
                  primary
                  ref={primaryButtonRef}
                  onClick={() => handleAction(isConfirmation ? 'confirm' : 'acknowledge')}
                >
                  {primaryLabel}
                </DialogButton>
              </AlertDialog.Action>
            </Dialog.ButtonRow>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    );
  }

  return (
    <div className={styles['toastLayer']} aria-live="polite" aria-atomic="true">
      <div
        className={styles['toastCard']}
        data-type={active.type}
        data-phase={phase}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="status"
      >
        <div className={styles['toastHeading']}>
          <NotificationIcon type={active.type} />
          {active.title && <div className={styles['title']}>{active.title}</div>}
        </div>
        <div className={styles['message']}>{active.message}</div>
      </div>
    </div>
  );
}

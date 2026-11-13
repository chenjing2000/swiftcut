import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useTranslation } from 'react-i18next';

import styles from './AlertDialog.module.css';
import { withClass } from './util';
import { DialogButton } from './Button';
import useCenteredDialogDrag from './useCenteredDialogDrag';

export * from '@radix-ui/react-alert-dialog';

export const Overlay = withClass(AlertDialog.Overlay, styles['AlertDialogOverlay']!);

export function Content({ className, style, ...props }: AlertDialog.AlertDialogContentProps) {
  const { offset, onPointerDown, onPointerMove, onPointerUp } = useCenteredDialogDrag();
  return (
    <AlertDialog.Content
      {...props}
      className={[styles['AlertDialogContent'], className].filter(Boolean).join(' ')}
      style={{ ...style, left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
    />
  );
}

export function Title({ className, ...props }: AlertDialog.AlertDialogTitleProps) {
  return <AlertDialog.Title {...props} data-dialog-drag-handle className={[styles['AlertDialogTitle'], className].filter(Boolean).join(' ')} />;
}

export const Description = withClass(AlertDialog.Description, styles['AlertDialogDescription']!);

export const Portal = (props: AlertDialog.AlertDialogPortalProps) => <AlertDialog.Portal container={document.getElementById('app-root')} {...props} />;

export function CancelButton() {
  const { t } = useTranslation();
  return (
    <AlertDialog.Cancel asChild>
      <DialogButton>{t('Cancel')}</DialogButton>
    </AlertDialog.Cancel>
  );
}

export function OkButton() {
  const { t } = useTranslation();
  return (
    <AlertDialog.Action asChild>
      <DialogButton primary>{t('OK')}</DialogButton>
    </AlertDialog.Action>
  );
}

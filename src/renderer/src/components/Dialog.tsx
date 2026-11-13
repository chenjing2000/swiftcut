import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { forwardRef } from 'react';

import styles from './Dialog.module.css';
import { withClass } from './util';
import CloseButtonRaw from './CloseButton';
import { dialogButtonOrder } from '../util';
import useCenteredDialogDrag from './useCenteredDialogDrag';

export * from '@radix-ui/react-dialog';

export const Overlay = withClass(Dialog.Overlay, styles['DialogOverlay']!);

// eslint-disable-next-line react/display-name
export const Content = forwardRef<HTMLDivElement, Dialog.DialogContentProps>(({ className, style, ...props }, ref) => {
  const { offset, onPointerDown, onPointerMove, onPointerUp } = useCenteredDialogDrag();
  return (
    <Dialog.Content
      ref={ref}
      {...props}
      className={[styles['DialogContent'], className].filter(Boolean).join(' ')}
      style={{ ...style, left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
    />
  );
});

export const Description = withClass(Dialog.Description, styles['DialogDescription']!);

export function Title({ className, ...props }: Dialog.DialogTitleProps) {
  return <Dialog.Title {...props} data-dialog-drag-handle className={[styles['DialogTitle'], className].filter(Boolean).join(' ')} />;
}

export const Portal = (props: Dialog.DialogPortalProps) => <Dialog.Portal container={document.getElementById('app-root')} {...props} />;

export const CloseButton = () => (
  <Dialog.Close asChild>
    <CloseButtonRaw style={{ top: 0, right: 0 }} />
  </Dialog.Close>
);

export function ButtonRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.5em', justifyContent: dialogButtonOrder === 'rtl' ? 'flex-start' : 'flex-end', marginTop: '1em', direction: dialogButtonOrder }}>
      {children}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import Swal from 'sweetalert2/dist/sweetalert2.js';

import '@radix-ui/themes/styles.css';
import './main.css';

import NotificationHost from './notifications/NotificationHost';
import OutputFloatingPanel from './components/OutputFloatingPanel';
import * as Dialog from './components/Dialog';
import OutputProgressPanel from './components/OutputProgressPanel';
import './swal2.scss';
import { enqueueNotification, requestConfirmation, showErrorNotification } from './notifications/notificationStore';
import type { NotificationType } from './notifications/notificationStore';

interface E2ENotificationInput {
  type: NotificationType;
  title?: string;
  message: string;
  details?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}

function TestHarness() {
  const [showOutputPanels, setShowOutputPanels] = useState(false);
  const [showParentDialog, setShowParentDialog] = useState(false);

  useEffect(() => {
    async function handleNotification({ type, title, message, details, primaryActionLabel, secondaryActionLabel }: E2ENotificationInput) {
      const notification = {
        message,
        ...(title != null && { title }),
        ...(details != null && { details }),
        ...(primaryActionLabel != null && { primaryActionLabel }),
        ...(secondaryActionLabel != null && { secondaryActionLabel }),
        source: 'notification-e2e',
      };
      switch (type) {
        case 'information':
        case 'success':
        case 'warning': {
          enqueueNotification({ ...notification, type });
          break;
        }
        case 'error': {
          delete document.documentElement.dataset['e2eLastErrorAction'];
          document.documentElement.dataset['e2eLastErrorAction'] = await showErrorNotification(notification);
          break;
        }
        case 'confirmation': {
          delete document.documentElement.dataset['e2eLastConfirmationResult'];
          document.documentElement.dataset['e2eLastConfirmationResult'] = String(await requestConfirmation(notification));
          break;
        }
        default: {
          throw new Error('Unsupported notification type');
        }
      }
    }

    function onTestNotification(event: Event) {
      const { detail } = event as CustomEvent<E2ENotificationInput>;
      handleNotification(detail).catch((error: unknown) => console.error('Notification E2E event failed', error));
    }

    const onParentDialog = (event: Event) => { setShowParentDialog(Boolean((event as CustomEvent<boolean>).detail)); };
    document.addEventListener('swiftcut-e2e-parent-dialog', onParentDialog);
    const onSweetAlert = () => {
      delete document.documentElement.dataset['e2eSwalResult'];
      Swal.fire({
        target: '#swal2-container-wrapper',
        title: 'SweetAlert compatibility check',
        text: 'The next blocking notification must remain clickable.',
        showCancelButton: true,
      }).then((result) => {
        document.documentElement.dataset['e2eSwalResult'] = result.isConfirmed ? 'confirm' : 'cancel';
        return result;
      }).catch((error: unknown) => console.error('SweetAlert E2E failed', error));
    };
    document.addEventListener('swiftcut-e2e-swal', onSweetAlert);
    const onOutputPanels = (event: Event) => { setShowOutputPanels(Boolean((event as CustomEvent<boolean>).detail)); };
    document.addEventListener('swiftcut-e2e-output-panels', onOutputPanels);
    document.addEventListener('swiftcut-e2e-notification', onTestNotification);
    document.documentElement.dataset['e2eActionsReady'] = 'true';
    return () => {
      document.removeEventListener('swiftcut-e2e-parent-dialog', onParentDialog);
      document.removeEventListener('swiftcut-e2e-swal', onSweetAlert);
      document.removeEventListener('swiftcut-e2e-output-panels', onOutputPanels);
      document.removeEventListener('swiftcut-e2e-notification', onTestNotification);
      delete document.documentElement.dataset['e2eActionsReady'];
    };
  }, []);

  return (
    <Theme appearance="light" accentColor="cyan">
      <div id="app-root" style={{ width: '100%', height: '100vh' }}>
        {showOutputPanels && (
          <>
            <OutputFloatingPanel id="audio-settings" open title="Extract Audio Settings" onClose={() => setShowOutputPanels(false)} footer={<button type="button" data-testid="e2e-output-action" onClick={() => { document.documentElement.dataset['e2eOutputClicked'] = 'true'; }}>Background action</button>}>
              <p>Extraction settings behind the modal</p>
            </OutputFloatingPanel>
            <OutputProgressPanel id="audio-progress" title="Extract Audio Progress" label="Paused" ariaLabel="Extract Audio Progress">
              <p>Output progress behind the modal</p>
            </OutputProgressPanel>
          </>
        )}
        <Dialog.Root open={showParentDialog} onOpenChange={setShowParentDialog}>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content data-testid="e2e-parent-dialog" aria-describedby={undefined}>
              <Dialog.Title>Parent settings dialog</Dialog.Title>
              <button type="button" onClick={() => setShowParentDialog(false)}>Close parent</button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <NotificationHost />
      </div>
      <div id="swal2-container-wrapper" />
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(<TestHarness />);

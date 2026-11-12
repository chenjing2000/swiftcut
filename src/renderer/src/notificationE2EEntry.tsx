import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';

import '@radix-ui/themes/styles.css';
import './main.css';

import NotificationHost from './notifications/NotificationHost';
import { enqueueNotification, requestConfirmation, showErrorNotification } from './notifications/notificationStore';
import type { NotificationType } from './notifications/notificationStore';

interface E2ENotificationInput {
  type: NotificationType;
  title?: string;
  message: string;
  details?: string;
}

function TestHarness() {
  useEffect(() => {
    async function handleNotification({ type, title, message, details }: E2ENotificationInput) {
      const notification = {
        message,
        ...(title != null && { title }),
        ...(details != null && { details }),
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
          document.documentElement.dataset['e2eLastErrorAction'] = await showErrorNotification(notification);
          break;
        }
        case 'confirmation': {
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

    document.addEventListener('swiftcut-e2e-notification', onTestNotification);
    document.documentElement.dataset['e2eActionsReady'] = 'true';
    return () => {
      document.removeEventListener('swiftcut-e2e-notification', onTestNotification);
      delete document.documentElement.dataset['e2eActionsReady'];
    };
  }, []);

  return (
    <Theme appearance="light" accentColor="cyan">
      <div id="app-root" style={{ width: '100%', height: '100vh' }}>
        <NotificationHost />
      </div>
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(<TestHarness />);

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

declare global {
  interface Window {
    swiftcutNotificationE2E?: { send: (payload: E2ENotificationInput) => void };
  }
}

function TestHarness() {
  useEffect(() => {
    window.swiftcutNotificationE2E = {
      send({ type, title, message, details }) {
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
            void showErrorNotification(notification).then((action) => {
              document.documentElement.dataset['e2eLastErrorAction'] = action;
            });
            break;
          }
          case 'confirmation': {
            void requestConfirmation(notification).then((result) => {
              document.documentElement.dataset['e2eLastConfirmationResult'] = String(result);
            });
            break;
          }
          default: {
            throw new Error('Unsupported notification type');
          }
        }
      },
    };
    document.documentElement.dataset['e2eActionsReady'] = 'true';
    return () => {
      delete window.swiftcutNotificationE2E;
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

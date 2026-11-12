// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, describe, expect, test } from 'vitest';

import {
  completeActiveNotification,
  enqueueNotification,
  getNotificationSnapshot,
  requestConfirmation,
  showErrorNotification,
  subscribeNotificationStore,
} from './notificationStore';

describe('notification store', () => {
  afterEach(() => {
    while (getNotificationSnapshot().active) completeActiveNotification('acknowledge');
  });

  test('displays notifications one at a time in FIFO order', () => {
    enqueueNotification({ message: 'First' });
    enqueueNotification({ message: 'Second' });
    enqueueNotification({ message: 'Third' });

    expect(getNotificationSnapshot().active?.message).toBe('First');
    expect(getNotificationSnapshot().queue.map((item) => item.message)).toStrictEqual(['Second', 'Third']);

    completeActiveNotification();
    expect(getNotificationSnapshot().active?.message).toBe('Second');
    completeActiveNotification();
    expect(getNotificationSnapshot().active?.message).toBe('Third');
  });

  test('prioritizes blocking messages without interrupting the active notification', () => {
    enqueueNotification({ message: 'Visible' });
    enqueueNotification({ message: 'Queued information' });
    const error = showErrorNotification({ title: 'Error', message: 'A blocking error' });

    expect(getNotificationSnapshot().active?.message).toBe('Visible');
    expect(getNotificationSnapshot().queue.map((item) => item.message)).toStrictEqual([
      'A blocking error',
      'Queued information',
    ]);

    completeActiveNotification();
    expect(getNotificationSnapshot().active?.message).toBe('A blocking error');
    completeActiveNotification('acknowledge');
    return expect(error).resolves.toBe('acknowledge');
  });

  test('resolves confirmation requests with the selected action', async () => {
    const result = requestConfirmation({ title: 'Confirm', message: 'Continue?' });
    completeActiveNotification('confirm');
    await expect(result).resolves.toBe(true);

    const cancelled = requestConfirmation({ title: 'Confirm', message: 'Continue?' });
    completeActiveNotification('cancel');
    await expect(cancelled).resolves.toBe(false);
  });

  test('deduplicates identical transient messages', () => {
    const firstId = enqueueNotification({ type: 'warning', title: 'Warning', message: 'Same message' });
    const secondId = enqueueNotification({ type: 'warning', title: 'Warning', message: 'Same message' });

    expect(secondId).toBe(firstId);
    expect(getNotificationSnapshot().queue).toHaveLength(0);
  });

  test('notifies subscribers when the snapshot changes', () => {
    let calls = 0;
    const unsubscribe = subscribeNotificationStore(() => { calls += 1; });

    enqueueNotification({ message: 'Hello' });
    completeActiveNotification();

    unsubscribe();
    expect(calls).toBe(2);
  });
});

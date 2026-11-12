import type { ReactNode } from 'react';

export type NotificationType = 'information' | 'success' | 'warning' | 'error' | 'confirmation';
export type NotificationAction = 'acknowledge' | 'confirm' | 'cancel';

export interface NotificationInput {
  type: NotificationType;
  title?: ReactNode;
  message: ReactNode;
  details?: string;
  source?: string;
  dedupeKey?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  focusPrimary?: boolean;
}

export interface NotificationMessage extends NotificationInput {
  id: string;
  resolve?: (action: NotificationAction) => void;
}

export interface NotificationSnapshot {
  active: NotificationMessage | undefined;
  queue: NotificationMessage[];
}

const listeners = new Set<() => void>();
let nextId = 0;
let snapshot: NotificationSnapshot = { active: undefined, queue: [] };

function publish(next: NotificationSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function isBlocking(type: NotificationType) {
  return type === 'error' || type === 'confirmation';
}

function getDedupeKey(message: NotificationInput) {
  if (message.dedupeKey) return message.dedupeKey;
  if (typeof message.title !== 'string' && message.title != null) return undefined;
  if (typeof message.message !== 'string') return undefined;
  return [message.type, message.source ?? '', message.title ?? '', message.message].join('|');
}

function enqueue(message: NotificationInput, resolve?: (action: NotificationAction) => void) {
  const dedupeKey = getDedupeKey(message);
  const existing = [snapshot.active, ...snapshot.queue].find((item) => (
    item != null
    && dedupeKey != null
    && getDedupeKey(item) === dedupeKey
    && !isBlocking(item.type)
    && !isBlocking(message.type)
  ));
  if (existing) return existing.id;

  const entry: NotificationMessage = {
    ...message,
    id: `notification-${nextId += 1}`,
    ...(resolve && { resolve }),
  };

  if (!snapshot.active) {
    publish({ active: entry, queue: snapshot.queue });
    return entry.id;
  }

  const queue = [...snapshot.queue];
  if (isBlocking(entry.type)) {
    const firstTransientIndex = queue.findIndex((item) => !isBlocking(item.type));
    if (firstTransientIndex === -1) queue.push(entry);
    else queue.splice(firstTransientIndex, 0, entry);
  } else {
    const transientCount = queue.filter((item) => !isBlocking(item.type)).length;
    if (transientCount >= 20) {
      const oldestTransientIndex = queue.findIndex((item) => !isBlocking(item.type));
      if (oldestTransientIndex !== -1) queue.splice(oldestTransientIndex, 1);
    }
    queue.push(entry);
  }

  publish({ active: snapshot.active, queue });
  return entry.id;
}

export function subscribeNotificationStore(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getNotificationSnapshot() {
  return snapshot;
}

export function enqueueNotification(message: Omit<NotificationInput, 'type'> & { type?: Exclude<NotificationType, 'error' | 'confirmation'> }) {
  return enqueue({ ...message, type: message.type ?? 'information' });
}

export function showErrorNotification(message: Omit<NotificationInput, 'type'>) {
  return new Promise<NotificationAction>((resolve) => {
    enqueue({ ...message, type: 'error' }, resolve);
  });
}

export function requestConfirmation(message: Omit<NotificationInput, 'type'>) {
  return new Promise<boolean>((resolve) => {
    enqueue({ ...message, type: 'confirmation' }, (action) => resolve(action === 'confirm'));
  });
}

export function completeActiveNotification(action: NotificationAction = 'acknowledge') {
  const current = snapshot.active;
  if (!current) return;

  current.resolve?.(action);
  const [next, ...remaining] = snapshot.queue;
  publish({ active: next, queue: remaining });
}

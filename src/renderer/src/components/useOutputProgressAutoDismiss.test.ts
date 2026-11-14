// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleOutputProgressDismiss } from './useOutputProgressAutoDismiss';

afterEach(() => {
  vi.useRealTimers();
});

describe('Successful Output progress auto-dismiss timing', () => {
  it('waits three seconds, fades for one, then dismisses', () => {
    vi.useFakeTimers();
    const fade = vi.fn<() => void>();
    const dismiss = vi.fn<() => void>();
    const cancel = scheduleOutputProgressDismiss(fade, dismiss);

    vi.advanceTimersByTime(2999);
    expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fade).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledOnce();
    cancel();
  });

  it('cancels both timers when a user interacts or the task changes', () => {
    vi.useFakeTimers();
    const fade = vi.fn<() => void>();
    const dismiss = vi.fn<() => void>();
    const cancel = scheduleOutputProgressDismiss(fade, dismiss);
    vi.advanceTimersByTime(3500);
    expect(fade).toHaveBeenCalledOnce();
    cancel();
    vi.advanceTimersByTime(10000);
    expect(dismiss).not.toHaveBeenCalled();

    const nextFade = vi.fn<() => void>();
    const nextDismiss = vi.fn<() => void>();
    const cancelNext = scheduleOutputProgressDismiss(nextFade, nextDismiss);
    vi.advanceTimersByTime(2999);
    expect(nextFade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1001);
    expect(nextFade).toHaveBeenCalledOnce();
    expect(nextDismiss).toHaveBeenCalledOnce();
    cancelNext();
  });
});

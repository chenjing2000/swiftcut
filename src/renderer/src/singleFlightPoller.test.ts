// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it, vi } from 'vitest';
import { createSingleFlightPoller } from './singleFlightPoller';

describe('Output status single-flight polling', () => {
  it('skips overlapping ticks and retries after the active request settles', async () => {
    const { promise: first, resolve: resolveFirst } = Promise.withResolvers<void>();
    const fetchStatus = vi.fn<() => Promise<void>>()
      .mockReturnValueOnce(first)
      .mockResolvedValue(undefined);
    const poller = createSingleFlightPoller(fetchStatus);

    const pending = poller.run();
    await poller.run();
    await poller.run();
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    resolveFirst();
    await pending;
    await poller.run();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('releases its guard after a rejected request', async () => {
    const fetchStatus = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValue(undefined);
    const poller = createSingleFlightPoller(fetchStatus);

    await expect(poller.run()).rejects.toThrow('IPC unavailable');
    await expect(poller.run()).resolves.toBeUndefined();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('prevents further ticks after the job changes or unmounts', async () => {
    const { promise: first, resolve: resolveFirst } = Promise.withResolvers<void>();
    const fetchStatus = vi.fn<() => Promise<void>>().mockReturnValue(first);
    const poller = createSingleFlightPoller(fetchStatus);
    const pending = poller.run();

    poller.dispose();
    await poller.run();
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    resolveFirst();
    await pending;
    await poller.run();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('does not couple separate audio and crop jobs', async () => {
    const audio = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const crop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await Promise.all([createSingleFlightPoller(audio).run(), createSingleFlightPoller(crop).run()]);
    expect(audio).toHaveBeenCalledOnce();
    expect(crop).toHaveBeenCalledOnce();
  });
});

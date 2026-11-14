/**
 * Skip ticks while an earlier status request is unfinished. Once that request
 * settles, the next tick may run; rejected requests must not lock polling.
 * Disposing prevents new requests, while callers still guard late responses.
 */
export function createSingleFlightPoller(poll: () => Promise<void>) {
  let inFlight = false;
  let disposed = false;

  return {
    async run(): Promise<void> {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        await poll();
      } finally {
        inFlight = false;
      }
    },
    dispose(): void {
      disposed = true;
    },
  };
}

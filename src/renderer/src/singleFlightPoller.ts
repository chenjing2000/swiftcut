// Skip ticks while a status request is in flight; release the guard even on
// errors. Disposal prevents new ticks, while callers guard late responses.
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

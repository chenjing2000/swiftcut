import { useEffect, useRef, useState } from 'react';

const successHoldMs = 3000;
const fadeMs = 1000;

/** Return cancellation so stale timers cannot dismiss another export job. */
export function scheduleOutputProgressDismiss(onFade: () => void, onDismiss: () => void) {
  const holdTimer = setTimeout(onFade, successHoldMs);
  const dismissTimer = setTimeout(onDismiss, successHoldMs + fadeMs);
  return () => {
    clearTimeout(holdTimer);
    clearTimeout(dismissTimer);
  };
}

/** Success-only lifecycle; cancellation, failure and partial results never time out. */
export default function useOutputProgressAutoDismiss(enabled: boolean, interacting: boolean, onDismiss: () => void) {
  const [fading, setFading] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!enabled || interacting) {
      // Reset outside the effect's synchronous execution to avoid cascaded renders.
      const resetTimer = setTimeout(() => setFading(false), 0);
      return () => clearTimeout(resetTimer);
    }

    return scheduleOutputProgressDismiss(() => setFading(true), () => onDismissRef.current());
  }, [enabled, interacting]);

  return enabled && !interacting && fading;
}

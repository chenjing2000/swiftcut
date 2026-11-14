import { useEffect, useRef, useState } from 'react';

const successHoldMs = 3000;
const fadeMs = 1000;

/** Success-only lifecycle; cancellation, failure and partial results never time out. */
export default function useOutputProgressAutoDismiss(enabled: boolean, interacting: boolean, onDismiss: () => void) {
  const [fading, setFading] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!enabled || interacting) {
      setFading(false);
      return undefined;
    }

    const holdTimer = window.setTimeout(() => setFading(true), successHoldMs);
    const dismissTimer = window.setTimeout(() => onDismissRef.current(), successHoldMs + fadeMs);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [enabled, interacting]);

  return fading;
}

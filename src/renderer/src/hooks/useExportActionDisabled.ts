import { useEffect, useRef, useState } from 'react';

// Keep submit actions locked until one second after their jobs become idle.
export default function useExportActionDisabled(busy: boolean) {
  const [cooldown, setCooldown] = useState(busy);
  const wasBusyRef = useRef(busy);

  useEffect(() => {
    if (busy) {
      wasBusyRef.current = true;
      setCooldown(true);
      return undefined;
    }
    if (!wasBusyRef.current) return undefined;
    wasBusyRef.current = false;
    const timeout = window.setTimeout(() => setCooldown(false), 1000);
    return () => window.clearTimeout(timeout);
  }, [busy]);

  return busy || cooldown;
}

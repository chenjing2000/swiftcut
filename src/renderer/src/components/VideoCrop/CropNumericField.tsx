import { useId, useState } from 'react';
import { sanitizeCropDigits } from '../../videoCropGeometry';
import styles from './VideoCropWorkspace.module.css';

export default function CropNumericField({ label, value, onCommit, disabled = false }: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  // An undefined draft displays the latest committed value.
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    const next = Number(draft);
    if (draft && Number.isSafeInteger(next)) onCommit(next);
    setDraft(undefined);
  };

  return (
    <div className={styles['numberField']}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => setDraft(sanitizeCropDigits(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(undefined);
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
      />
    </div>
  );
}

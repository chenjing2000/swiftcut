import type { ReactNode } from 'react';
import styles from './VideoCrop/CropExportProgress.module.css';

/** Shared visual elements; export jobs retain their own state and cancellation logic. */
export function ExportProgressHeader({ title, label, state }: { title: ReactNode; label: ReactNode; state?: string }) {
  return (
    <div className={styles['heading']}>
      <strong>{title}</strong>
      <span className={styles['status']} data-state={state}>{label}</span>
    </div>
  );
}

export function ExportOutputPaths({ paths, heading }: { paths: readonly string[]; heading?: ReactNode }) {
  if (paths.length === 0) return null;
  return (
    <div className={styles['outputs']}>
      {heading != null && <div className={styles['outputHeading']}>{heading}</div>}
      <ul className={styles['paths']}>
        {paths.map((path) => <li key={path} title={path}>{path}</li>)}
      </ul>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import Button from './Button';
import styles from './VideoCrop/CropExportProgress.module.css';

interface Props {
  state: 'running' | 'finalizing' | 'cancelling' | 'cancelled' | 'success';
  outputPaths: string[];
  text: string;
  progress?: number | undefined;
  onCancel: () => void;
  onDismiss: () => void;
}

/** Lossless and re-encoded exports share the same progress-panel presentation. */
export default function LosslessExportProgress({ state, text, progress, outputPaths, onCancel, onDismiss }: Props) {
  const { t } = useTranslation();
  const active = state === 'running' || state === 'finalizing' || state === 'cancelling';
  const stateLabels = { running: 'Exporting', finalizing: 'Finalizing export', cancelling: 'Cancelling export', cancelled: 'Cancelled', success: 'Export finished' } as const;
  const stateLabel = stateLabels[state];
  const displayStates = { running: undefined, finalizing: undefined, cancelling: undefined, cancelled: 'cancelled', success: 'success' } as const;
  const displayState = displayStates[state];
  const percent = progress == null ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <aside className={styles['panel']} role="status" aria-live="polite" aria-label={t('Export Video Settings')}>
      <div className={styles['heading']}>
        <strong>{t('Export Video')}</strong>
        <span className={styles['status']} data-state={displayState}>{t(stateLabel)}</span>
      </div>
      <div className={styles['contents']}>
        {active ? (
          <>
            <div className={styles['progressText']}>
              <span>{text}</span>
              {percent != null && <span>{percent}%</span>}
            </div>
            {percent != null && <progress className={styles['progress']} value={percent} max={100} />}
            <div className={styles['actions']}>
              <Button disabled={state !== 'running'} onClick={onCancel}>{t('Cancel Export')}</Button>
            </div>
          </>
        ) : (
          <>
            {state === 'success' ? (
              <>
                <p>{t('{{count}} output file(s) saved.', { count: outputPaths.length })}</p>
                <div className={styles['outputs']}>
                  <ul className={styles['paths']}>
                    {outputPaths.map((path) => <li key={path} title={path}>{path}</li>)}
                  </ul>
                </div>
              </>
            ) : <p>{t('Cancelled')}</p>}
            <div className={styles['actions']}><Button onClick={onDismiss}>{t('Dismiss')}</Button></div>
          </>
        )}
      </div>
    </aside>
  );
}

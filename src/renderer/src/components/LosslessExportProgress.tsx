import { useTranslation } from 'react-i18next';
import Button from './Button';
import styles from './VideoCrop/CropExportProgress.module.css';

interface Props {
  state: 'running' | 'cancelling' | 'cancelled';
  text: string;
  progress?: number | undefined;
  onCancel: () => void;
  onDismiss: () => void;
}

/** Lossless and re-encoded exports share the same progress-panel presentation. */
export default function LosslessExportProgress({ state, text, progress, onCancel, onDismiss }: Props) {
  const { t } = useTranslation();
  const active = state !== 'cancelled';
  const stateLabel = state === 'cancelled' ? 'Cancelled' : state === 'cancelling' ? 'Cancelling export' : 'Exporting';
  const percent = progress == null ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <aside className={styles['panel']} role="status" aria-live="polite" aria-label={t('Export Video Settings')}>
      <div className={styles['heading']}>
        <strong>{t('Export Video')}</strong>
        <span className={styles['status']}>{t(stateLabel)}</span>
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
              <Button disabled={state === 'cancelling'} onClick={onCancel}>{t('Cancel Export')}</Button>
            </div>
          </>
        ) : (
          <>
            <p>{t('Cancelled')}</p>
            <div className={styles['actions']}><Button onClick={onDismiss}>{t('Dismiss')}</Button></div>
          </>
        )}
      </div>
    </aside>
  );
}

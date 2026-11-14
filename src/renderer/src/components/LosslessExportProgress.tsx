import { useTranslation } from 'react-i18next';
import Button from './Button';
import { ExportOutputPaths } from './ExportProgressParts';
import OutputProgressPanel from './OutputProgressPanel';
import styles from './VideoCrop/CropExportProgress.module.css';

interface Props {
  state: 'running' | 'finalizing' | 'cancelling' | 'cancelled' | 'success' | 'failed';
  outputPaths: string[];
  notices: string[];
  warnings: string[];
  error?: string | undefined;
  text: string;
  progress?: number | undefined;
  onCancel: () => void;
  onDismiss: () => void;
}

/** Lossless and re-encoded exports share the same progress-panel presentation. */
export default function LosslessExportProgress({ state, text, progress, outputPaths, notices, warnings, error, onCancel, onDismiss }: Props) {
  const { t } = useTranslation();
  const active = ['running', 'finalizing', 'cancelling'].includes(state);
  const stateLabels = { running: 'Exporting', finalizing: 'Finalizing export', cancelling: 'Cancelling export', cancelled: 'Cancelled', success: 'Export finished', failed: 'Failed' } as const;
  const stateLabel = stateLabels[state];
  const displayStates = { running: undefined, finalizing: undefined, cancelling: undefined, cancelled: 'cancelled', success: 'success', failed: 'failed' } as const;
  const displayState = displayStates[state];
  const percent = progress == null ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <OutputProgressPanel
      id="lossless-progress"
      ariaLabel={t('Export Video Settings')}
      title={t('Export Video')}
      label={t(stateLabel)}
      state={displayState}
      autoDismiss={state === 'success' && warnings.length === 0}
      onDismiss={onDismiss}
    >
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
            {state === 'success' && (
              <>
                <p>{t('{{count}} output file(s) saved.', { count: outputPaths.length })}</p>
                <ExportOutputPaths paths={outputPaths} />
                {notices.map((notice) => <p key={notice}>{notice}</p>)}
                {warnings.map((warning) => <p key={warning} className={styles['warning']}>{warning}</p>)}
              </>
            )}
            {state === 'failed' && (
              <>
                <p role="alert" className={styles['error']}>{t('Failed')}</p>
                {error && <p className={styles['error']}>{error}</p>}
              </>
            )}
            {state === 'cancelled' && <p>{t('Cancelled')}</p>}
            <div className={styles['actions']}><Button onClick={onDismiss}>{t('Dismiss')}</Button></div>
          </>
        )}
      </div>
    </OutputProgressPanel>
  );
}

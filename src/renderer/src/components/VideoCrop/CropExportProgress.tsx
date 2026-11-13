import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CropExportStatus } from '../../../../main/videoCropExportService.js';
import Button from '../Button';
import { getCropExportPresentation } from './cropExportPresentation';

import styles from './CropExportProgress.module.css';

interface Props {
  status: CropExportStatus;
  onCancel: () => Promise<void>;
  onDismiss: () => void;
}

export default function CropExportProgress({ status, onCancel, onDismiss }: Props) {
  const { t } = useTranslation();
  const [cancelRequested, setCancelRequested] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const presentation = getCropExportPresentation(status);
  const percent = Math.round(Math.max(0, Math.min(1, status.progress)) * 100);
  const savedCount = status.outputPaths?.length ?? 0;

  const cancel = async () => {
    if (cancelRequested) return;
    setCancelRequested(true);
    setCancelError(undefined);
    try {
      await onCancel();
    } catch (error) {
      setCancelRequested(false);
      setCancelError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside
      className={styles['panel']}
      data-testid="crop-export-progress"
      data-state={status.state}
      aria-label={t('Crop video export')}
    >
      <div className={styles['heading']}>
        <strong>{t(presentation.title)}</strong>
        <span className={styles['status']} data-state={status.state}>{t(presentation.label)}</span>
      </div>
      {presentation.active ? (
        <div className={styles['contents']} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles['progressText']}>
            <span>{t('Crop export progress', { percent })}</span>
            <span>{t('Crop segments completed', { completed: status.completedSegments ?? 0, total: status.totalSegments ?? 1 })}</span>
          </div>
          <progress className={styles['progress']} value={percent} max={100} aria-label={t('Crop export progress', { percent })} />
          {cancelError && <p className={styles['error']} role="alert">{cancelError}</p>}
          <div className={styles['actions']}>
            <Button type="button" disabled={cancelRequested} onClick={() => { cancel().catch(console.error); }}>
              {t(cancelRequested ? 'Cancelling crop export' : 'Cancel Export')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles['contents']}>
          {status.state === 'partial_success' && (
            <p role="status">{t('Crop partially saved files', { count: savedCount })}</p>
          )}
          {savedCount > 0 && (
            <div className={styles['outputs']}>
              <div className={styles['outputHeading']}>{t('Crop exported files')}</div>
              <ul className={styles['paths']}>
                {status.outputPaths?.map((path) => <li key={path} title={path}>{path}</li>)}
              </ul>
            </div>
          )}
          {status.error && <p className={styles['error']} role="alert">{status.error}</p>}
          {status.cleanupWarning && <p className={styles['warning']} role="alert">{t('Crop cleanup warning', { details: status.cleanupWarning })}</p>}
          <div className={styles['actions']}>
            <Button type="button" onClick={onDismiss}>{t('Dismiss')}</Button>
          </div>
        </div>
      )}
    </aside>
  );
}

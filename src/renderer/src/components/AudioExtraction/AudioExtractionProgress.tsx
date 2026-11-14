import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudioJobStatus } from '../../../../main/audioExtraction';
import { ExportOutputPaths } from '../ExportProgressParts';
import OutputProgressPanel from '../OutputProgressPanel';
import Button from '../Button';
import styles from '../VideoCrop/CropExportProgress.module.css';

interface Props {
  job: AudioJobStatus;
  onCancel: () => Promise<void>;
  onDismiss: () => void;
}

/** Shows extraction status independently of the settings dialog. */
export default function AudioExtractionProgress({ job, onCancel, onDismiss }: Props) {
  const { t } = useTranslation();
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const requestCancel = async () => {
    if (cancelPending) return;
    setCancelPending(true);
    setCancelError(undefined);
    try {
      await onCancel();
    } catch (error) {
      setCancelPending(false);
      setCancelError(error instanceof Error ? error.message : String(error));
    }
  };
  const active = job.state === 'running' || job.state === 'paused';
  const percentage = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
  const currentTask = job.tasks.find((task) => task.state === 'running');
  const current = currentTask ? job.completedTasks + 1 : job.completedTasks;
  const failed = job.tasks.filter((task) => task.state === 'failed').length;
  const labels = {
    running: 'Exporting',
    paused: 'Paused',
    success: 'Export finished',
    cancelled: 'Cancelled',
    failed: 'Failed',
  } as const;

  return (
    <OutputProgressPanel
      id="audio-progress"
      ariaLabel={t('Extract Audio Settings')}
      title={t('Extract Audio')}
      label={t(labels[job.state])}
      state={job.state}
      autoDismiss={job.state === 'success'}
      onDismiss={onDismiss}
    >
      <div className={styles['contents']}>
        {active ? (
          <>
            <div className={styles['progressText']}>
              <span>{t('Extracting {{progress}}% · {{current}}/{{total}}', { progress: percentage, current, total: job.totalTasks })}</span>
              <span>{percentage}%</span>
            </div>
            <progress className={styles['progress']} value={percentage} max={100} />
            {job.state === 'paused' && (
              <p>{t('Extraction paused after an error. Confirm the message to continue or cancel the remaining tasks.')}</p>
            )}
            {cancelError && <p role="alert" className={styles['error']}>{cancelError}</p>}
            <div className={styles['actions']}>
              <Button type="button" disabled={cancelPending} onClick={() => { requestCancel().catch(console.error); }}>
                {t(cancelPending ? 'Cancelling export' : 'Cancel Export')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {job.state === 'success' && <p>{t('{{count}} output file(s) saved.', { count: job.outputPaths.length })}</p>}
            {job.state === 'cancelled' && <p>{t('Extraction cancelled. {{count}} output file(s) saved.', { count: job.outputPaths.length })}</p>}
            {job.state === 'failed' && <p>{t('Extraction finished with {{failed}} failed task(s). {{success}} output file(s) saved.', { failed, success: job.outputPaths.length })}</p>}
            <ExportOutputPaths paths={job.outputPaths} />
            {job.error && <p className={styles['error']} role="alert">{job.error}</p>}
            <div className={styles['actions']}>
              <Button type="button" onClick={onDismiss}>{t('Dismiss')}</Button>
            </div>
          </>
        )}
      </div>
    </OutputProgressPanel>
  );
}

import { useTranslation } from 'react-i18next';
import type { AudioJobStatus } from '../../../../main/audioExtraction';
import { ExportOutputPaths, ExportProgressHeader } from '../ExportProgressParts';
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
    <aside className={styles['panel']} role="status" aria-live="polite" aria-label={t('Extract Audio Settings')}>
      <ExportProgressHeader title={t('Extract Audio')} label={t(labels[job.state])} state={job.state} />
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
            <div className={styles['actions']}>
              <Button type="button" onClick={() => { onCancel().catch(console.error); }}>{t('Cancel Export')}</Button>
            </div>
          </>
        ) : (
          <>
            {job.state === 'success'
              ? <p>{t('{{count}} output file(s) saved.', { count: job.outputPaths.length })}</p>
              : <p>{t('Extraction finished with {{failed}} failed task(s). {{success}} output file(s) saved.', { failed, success: job.outputPaths.length })}</p>}
            <ExportOutputPaths paths={job.outputPaths} heading={t('Crop exported files')} />
            {job.error && <p className={styles['error']} role="alert">{job.error}</p>}
            <div className={styles['actions']}>
              <Button type="button" onClick={onDismiss}>{t('Dismiss')}</Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

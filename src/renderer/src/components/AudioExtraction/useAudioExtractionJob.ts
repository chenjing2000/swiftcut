import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mainApi from '../../mainApi';
import { showErrorNotification } from '../../notifications/notificationStore';
import type { SegmentToExport } from '../../types';
import type { AudioExtractionMode, Mp3Quality, AudioJobStatus } from '../../../../main/audioExtraction';

interface Params {
  filePath: string | undefined;
  selectedStreamIndexes: number[];
  mode: AudioExtractionMode;
  quality: Mp3Quality;
  segments: SegmentToExport[];
  outputMode: 'merge' | 'separate';
}

/** Keeps extraction lifecycle and polling out of the settings presentation. */
export default function useAudioExtractionJob({ filePath, selectedStreamIndexes, mode, quality, segments, outputMode }: Params) {
  const { t } = useTranslation();
  const [job, setJob] = useState<AudioJobStatus>();
  const [isStarting, setIsStarting] = useState(false);

  const pollingJobId = job && (job.state === 'running' || job.state === 'paused') ? job.id : undefined;
  const handledPauseTaskRef = useRef<string | undefined>(undefined);
  const pollingErrorShownRef = useRef(false);

  useEffect(() => {
    if (pollingJobId == null) return undefined;

    let disposed = false;

    const pollStatus = async () => {
      try {
        const status = await mainApi.getAudioExtractionStatus(pollingJobId);
        if (!status || disposed) return;
        setJob(status);
        pollingErrorShownRef.current = false;

        if (status.state === 'paused') {
          const failedTask = status.tasks.findLast((task) => task.state === 'failed' && task.error);
          if (!failedTask) return;

          const taskKey = `${pollingJobId}:${failedTask.segmentNumber}:${failedTask.trackNumber}:${failedTask.streamIndex}`;
          if (handledPauseTaskRef.current === taskKey) return;
          handledPauseTaskRef.current = taskKey;

          const action = await showErrorNotification({
            title: t('Audio extraction failed'),
            message: t('Segment {{segment}} · Track {{track}} could not be extracted. The remaining tasks are paused.', {
              segment: failedTask.segmentNumber,
              track: failedTask.trackNumber,
            }),
            ...(failedTask.error && { details: failedTask.error }),
            primaryActionLabel: t('Continue'),
            secondaryActionLabel: t('Cancel remaining tasks'),
            source: `audio-extraction:${taskKey}`,
            focusPrimary: true,
          });

          if (disposed) return;
          await (action === 'cancel' ? mainApi.cancelAudioExtraction(pollingJobId) : mainApi.resumeAudioExtraction(pollingJobId));
        }
      } catch (err) {
        if (disposed || pollingErrorShownRef.current) return;
        pollingErrorShownRef.current = true;
        showErrorNotification({
          title: t('Unable to read extraction status'),
          message: err instanceof Error ? err.message : String(err),
          ...(err instanceof Error && err.stack && { details: err.stack }),
          source: `audio-extraction-status:${pollingJobId}`,
        }).catch((notificationError: unknown) => console.error('Failed to show audio extraction status error', notificationError));
      }
    };

    const timer = setInterval(() => { pollStatus().catch(console.error); }, 400);
    pollStatus().catch(console.error);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [pollingJobId, t]);

  const startExtraction = async () => {
    if (!filePath || selectedStreamIndexes.length === 0 || isStarting || job?.state === 'running' || job?.state === 'paused') return false;
    setIsStarting(true);
    setJob(undefined);
    try {
      const id = await mainApi.startAudioExtraction({
        inputPath: filePath,
        mode,
        streamIndexes: selectedStreamIndexes,
        quality,
        outputMode,
        segments: segments.map(({ start, end }) => ({ start, end })),
      });
      setJob({
        id,
        state: 'running',
        progress: 0,
        completedTasks: 0,
        totalTasks: selectedStreamIndexes.length * Math.max(segments.length, 1),
        tasks: [],
        outputPaths: [],
      });
      return true;
    } catch (err) {
      await showErrorNotification({
        title: t('Unable to start audio extraction'),
        message: err instanceof Error ? err.message : String(err),
        ...(err instanceof Error && err.stack && { details: err.stack }),
        source: 'audio-extraction-start',
      });
      return false;
    } finally {
      setIsStarting(false);
    }
  };

  const cancelExtraction = async () => {
    if (job?.state === 'running' || job?.state === 'paused') await mainApi.cancelAudioExtraction(job.id);
  };


  const isBusy = isStarting || job?.state === 'running' || job?.state === 'paused';
  const dismissJob = () => {
    if (!isBusy) setJob(undefined);
  };
  return { job, isStarting, isBusy, startExtraction, cancelExtraction, dismissJob };
}

import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import mainApi from '../../mainApi';
import { showErrorNotification } from '../../notifications/notificationStore';
import * as Dialog from '../Dialog';
import actionStyles from '../OutputActionButtons.module.css';
import chrome from '../OutputPanelChrome.module.css';
import { dangerColor, primaryTextColor, saveColor, warningColor } from '../../colors';
import Checkbox from '../Checkbox';
import type { FFprobeStream } from '../../../../common/ffprobe';
import type { SegmentToExport } from '../../types';

import type { AudioExtractionMode, Mp3Quality, AudioJobStatus, AudioExtractionTaskStatus } from '../../../../main/audioExtraction';

interface AudioExtractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | undefined;
  streams: FFprobeStream[];
  segments: SegmentToExport[];
  fileDuration: number | undefined;
  formatName: string | undefined;
}

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
};

const getFileName = (path: string) => path.split(/[\\/]/u).at(-1) ?? path;

const getTaskStateLabel = (task: AudioExtractionTaskStatus, t: (key: string) => string) => {
  switch (task.state) {
    case 'pending': {
      return t('Pending');
    }
    case 'running': {
      return t('Running');
    }
    case 'success': {
      return t('Saved');
    }
    case 'failed': {
      return t('Failed');
    }
    case 'cancelled': {
      return t('Cancelled');
    }
    case 'skipped': {
      return t('Skipped');
    }
    default: {
      return task.state;
    }
  }
};

const getTaskStateColor = (task: AudioExtractionTaskStatus) => {
  switch (task.state) {
    case 'success': {
      return saveColor;
    }
    case 'failed': {
      return dangerColor;
    }
    case 'cancelled': {
      return warningColor;
    }
    case 'running': {
      return primaryTextColor;
    }
    case 'pending':
    case 'skipped': {
      return 'var(--gray-11)';
    }
    default: {
      return 'var(--gray-11)';
    }
  }
};

export default function AudioExtractionDialog({ open, onOpenChange, filePath, streams, segments, formatName }: AudioExtractionDialogProps) {
  const { t } = useTranslation();
  const [selectedStreamIndexes, setSelectedStreamIndexes] = useState<number[]>(() => (
    streams.length > 0 ? [streams[0]!.index] : []
  ));
  const [mode, setMode] = useState<AudioExtractionMode>('mp3');
  const [quality, setQuality] = useState<Mp3Quality>('vbr');
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
    if (!filePath || selectedStreamIndexes.length === 0 || isStarting || job?.state === 'running' || job?.state === 'paused') return;
    setIsStarting(true);
    setJob(undefined);
    try {
      const id = await mainApi.startAudioExtraction({
        inputPath: filePath,
        mode,
        streamIndexes: selectedStreamIndexes,
        quality,
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
    } catch (err) {
      await showErrorNotification({
        title: t('Unable to start audio extraction'),
        message: err instanceof Error ? err.message : String(err),
        ...(err instanceof Error && err.stack && { details: err.stack }),
        source: 'audio-extraction-start',
      });
    } finally {
      setIsStarting(false);
    }
  };

  const cancelExtraction = async () => {
    if (job?.state === 'running' || job?.state === 'paused') await mainApi.cancelAudioExtraction(job.id);
  };

  const isMp4 = useMemo(() => {
    const extensionIsMp4 = filePath?.toLowerCase().endsWith('.mp4') ?? false;
    const containerIsMp4 = (formatName ?? '').split(',').some((format) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format.trim()));
    return extensionIsMp4 && containerIsMp4;
  }, [filePath, formatName]);

  const selectedCount = selectedStreamIndexes.length;
  const segmentCount = Math.max(segments.length, 1);
  const outputCount = selectedCount * segmentCount;
  const currentTask = job?.tasks.find((task) => task.state === 'running');
  const currentTaskNumber = currentTask ? (job?.completedTasks ?? 0) + 1 : job?.completedTasks ?? 0;
  const savedTaskCount = job?.tasks.filter((task) => task.state === 'success').length ?? 0;
  const failedTaskCount = job?.tasks.filter((task) => task.state === 'failed').length ?? 0;
  const cancelledTaskCount = job?.tasks.filter((task) => task.state === 'cancelled').length ?? 0;
  const skippedTaskCount = job?.tasks.filter((task) => task.state === 'skipped').length ?? 0;
  const isBusy = isStarting || job?.state === 'running' || job?.state === 'paused';
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) return;
    onOpenChange(nextOpen);
  };

  const toggleStream = (streamIndex: number, checked: boolean) => {
    setSelectedStreamIndexes((current) => {
      if (checked) return current.includes(streamIndex) ? current : [...current, streamIndex];
      return current.filter((index) => index !== streamIndex);
    });
  };

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {/* This settings panel uses the same unobscured floating presentation as Crop Video. */}
        <Dialog.Content
          style={{
            width: '380px',
            left: 'max(8px, calc(100% - 396px))',
            top: '48px',
            transform: 'none',
            minWidth: 'min(320px, calc(100vw - 16px))',
            maxWidth: 'min(380px, calc(100vw - 16px))',
            fontSize: '13px',
            height: 'min(42rem, 85vh)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0,
          }}
          aria-describedby={undefined}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div data-dialog-drag-handle className={chrome['heading']}>
            <Dialog.Title style={{ margin: 0, padding: 0, border: 0, fontSize: '14px', fontWeight: 700 }}>{t('Extract Audio Settings')}</Dialog.Title>
            <button
              type="button"
              aria-label={t('Close')}
              disabled={isBusy}
              onClick={() => handleOpenChange(false)}
              style={{ cursor: isBusy ? 'not-allowed' : 'pointer' }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              padding: '12px',
            }}
          >
            <Dialog.Description>{t('Extract selected audio tracks from the selected segments of the currently opened MP4 file. Each track and segment combination will be saved as a separate audio file.')}</Dialog.Description>

            <section style={{ marginBottom: '1.2em' }}>
              <strong>{t('Input file')}</strong>
              <div style={{ marginTop: '.35em', overflowWrap: 'anywhere' }}>{filePath ?? t('No media file opened')}</div>
              {!isMp4 && <p style={{ color: 'var(--red-10)', marginBottom: 0 }}>{t('This feature currently supports MP4 files only.')}</p>}
            </section>

            <section style={{ marginBottom: '1.2em' }}>
              <strong>{t('Audio tracks')}</strong>
              {streams.length === 0 ? (
                <p>{t('No audio tracks found.')}</p>
              ) : (
                <div style={{ display: 'grid', gap: '.5em', marginTop: '.6em' }}>
                  {streams.map((stream, index) => (
                    <Checkbox
                      key={stream.index}
                      checked={selectedStreamIndexes.includes(stream.index)}
                      onCheckedChange={(checked) => toggleStream(stream.index, checked === true)}
                      label={t('Track {{number}} · {{codec}} · {{channels}} channels · {{sampleRate}} Hz', {
                        number: index + 1,
                        codec: stream.codec_name?.toUpperCase() ?? 'Unknown',
                        channels: stream.channels ?? '?',
                        sampleRate: stream.sample_rate ?? '?',
                      })}
                    />
                  ))}
                </div>
              )}
            </section>

            <section style={{ marginBottom: '1.2em' }}>
              <strong>{t('Output mode')}</strong>
              <div style={{ display: 'grid', gap: '.5em', marginTop: '.6em' }}>
                <label htmlFor="audio-extraction-mode-original" style={{ display: 'flex', alignItems: 'center', gap: '.55em' }}>
                  <input id="audio-extraction-mode-original" type="radio" name="audio-extraction-mode" value="original" checked={mode === 'original'} disabled={isBusy} onChange={() => setMode('original')} />
                  {t('Original (no re-encoding)')}
                </label>
                <label htmlFor="audio-extraction-mode-mp3" style={{ display: 'flex', alignItems: 'center', gap: '.55em' }}>
                  <input id="audio-extraction-mode-mp3" type="radio" name="audio-extraction-mode" value="mp3" checked={mode === 'mp3'} disabled={isBusy} onChange={() => setMode('mp3')} />
                  {t('MP3 (re-encode)')}
                </label>
              </div>
              {mode === 'original' && (
                <p style={{ color: 'var(--gray-11)', fontSize: '.9em', marginBottom: 0 }}>
                  {t('Original mode copies each selected audio stream without decoding or re-encoding. The output container is selected automatically from the source codec. Segment boundaries may align to audio packet boundaries.')}
                </p>
              )}
            </section>

            <section style={{ marginBottom: '1.2em', opacity: mode === 'original' ? 0.5 : 1 }}>
              <strong>{t('MP3 quality')}</strong>
              <div style={{ display: 'grid', gap: '.5em', marginTop: '.6em' }}>
                {([
                  ['vbr', t('VBR (LAME Quality 2) — Recommended')],
                  ['320k', '320 kbps'],
                  ['192k', '192 kbps'],
                ] as const).map(([value, label]) => {
                  const inputId = `audio-extraction-quality-${value}`;
                  return (
                    <label key={value} htmlFor={inputId} style={{ display: 'flex', alignItems: 'center', gap: '.55em' }}>
                      <input id={inputId} type="radio" name="audio-extraction-quality" value={value} checked={quality === value} disabled={mode === 'original' || isBusy} onChange={() => setQuality(value)} />
                      {label}
                    </label>
                  );
                })}
              </div>
            </section>

            <section style={{ marginBottom: '1em' }}>
              <strong>{t('Extraction segments')}</strong>
              <p style={{ margin: '.35em 0' }}>
                {t('{{segments}} segment(s) × {{tracks}} track(s) = {{outputs}} output file(s).', {
                  segments: segmentCount,
                  tracks: selectedCount,
                  outputs: outputCount,
                })}
              </p>
              {segments.length === 0 ? (
                <div>{t('Entire video')}</div>
              ) : (
                <div style={{ maxHeight: '8em', overflowY: 'auto', paddingLeft: '1.5em' }}>
                  {segments.map((segment, index) => (
                    <div key={`${segment.originalIndex}-${segment.start}-${segment.end}`}>
                      {t('Segment {{number}}', { number: index + 1 })}: {formatTime(segment.start)} – {formatTime(segment.end)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {isStarting && <div role="status" style={{ marginTop: '.6em' }}>{t('Preparing extraction...')}</div>}
            {job && (
              <section style={{ marginTop: '.6em' }}>
                <div role="status" style={{ marginBottom: '.5em' }}>
                  {job.state === 'running' && t('Extracting {{progress}}% · {{current}}/{{total}}', {
                    progress: Math.round(job.progress * 100),
                    current: currentTaskNumber,
                    total: job.totalTasks,
                  })}
                  {job.state === 'paused' && t('Extraction paused after an error. Confirm the message to continue or cancel the remaining tasks.')}
                  {job.state === 'success' && t('{{count}} output file(s) saved.', { count: job.outputPaths.length })}
                  {job.state === 'cancelled' && t('Extraction cancelled. {{count}} output file(s) saved.', { count: job.outputPaths.length })}
                  {job.state === 'failed' && t('Extraction finished with {{failed}} failed task(s). {{success}} output file(s) saved.', {
                    failed: failedTaskCount,
                    success: job.outputPaths.length,
                  })}
                </div>
                {job.state === 'cancelled' && (
                  <div style={{ color: 'var(--gray-11)', fontSize: '.9em', marginBottom: '.5em' }}>
                    {savedTaskCount} {t('Saved')}
                    {failedTaskCount > 0 && <> · {failedTaskCount} {t('Failed')}</>}
                    {' · '}{cancelledTaskCount} {t('Cancelled')} · {skippedTaskCount} {t('Skipped')}
                  </div>
                )}
                {job.tasks.length > 0 && (
                  <div style={{ maxHeight: '10em', overflowY: 'auto', border: '1px solid var(--gray-6)', borderRadius: 6, padding: '.5em' }}>
                    {job.tasks.map((task, index) => (
                      <div key={`${task.segmentNumber}-${task.trackNumber}-${task.streamIndex}`} style={{ padding: '.25em 0', borderBottom: index < job.tasks.length - 1 ? '1px solid var(--gray-5)' : undefined }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5em' }}>
                          <span>{t('Segment {{segment}} · Track {{track}}', { segment: task.segmentNumber, track: task.trackNumber })}</span>
                          <strong style={{ color: getTaskStateColor(task) }}>{getTaskStateLabel(task, t)}{task.state === 'running' ? ` ${Math.round(task.progress * 100)}%` : ''}</strong>
                        </div>
                        {task.outputPath && <div style={{ overflowWrap: 'anywhere', color: 'var(--gray-11)', fontSize: '.85em' }}>{getFileName(task.outputPath)}</div>}
                        {task.state === 'failed' && task.error && <div role="alert" style={{ color: 'var(--red-10)', fontSize: '.85em' }}>{task.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
          <div className={chrome['footer']}>
            <button
              type="button"
              className={actionStyles['action']}
              disabled={isStarting}
              onClick={() => {
                if (job?.state === 'running' || job?.state === 'paused') cancelExtraction().catch(console.error);
                else handleOpenChange(false);
              }}
            >
              {t('Cancel')}
            </button>
            <button type="button" className={`${actionStyles['action']} ${actionStyles['primary']}`} disabled={!isMp4 || selectedCount === 0 || isBusy} onClick={startExtraction}>{t('Extract')}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

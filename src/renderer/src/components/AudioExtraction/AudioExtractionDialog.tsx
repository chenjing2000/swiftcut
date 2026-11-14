import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import OutputFloatingPanel from '../OutputFloatingPanel';
import actionStyles from '../OutputActionButtons.module.css';
import styles from './AudioExtractionDialog.module.css';
import Checkbox from '../Checkbox';
import type { FFprobeStream } from '../../../../common/ffprobe';
import type { SegmentToExport } from '../../types';

import type { AudioExtractionMode, Mp3Quality } from '../../../../main/audioExtraction';
import AudioExtractionProgress from './AudioExtractionProgress';
import useAudioExtractionJob from './useAudioExtractionJob';

interface AudioExtractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | undefined;
  streams: FFprobeStream[];
  segments: SegmentToExport[];
  formatName: string | undefined;
}

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
};

export default function AudioExtractionDialog({ open, onOpenChange, filePath, streams, segments, formatName }: AudioExtractionDialogProps) {
  const { t } = useTranslation();
  const [trackSelection, setTrackSelection] = useState<{ source: string | undefined; indexes: number[] }>();
  // The long-lived job presenter survives source changes. A new source gets
  // its own default track without resetting the currently running job.
  const selectedStreamIndexes = trackSelection != null && trackSelection.source === filePath
    ? trackSelection.indexes : (streams[0] ? [streams[0].index] : []);
  const [mode, setMode] = useState<AudioExtractionMode>('original');
  const [timeRange, setTimeRange] = useState<'selected' | 'entire'>(segments.length > 0 ? 'selected' : 'entire');
  // The settings component remains mounted while closed so the audio job can
  // outlive the window. Reset file-dependent defaults only on source changes.
  useEffect(() => {
    setTimeRange(segments.length > 0 ? 'selected' : 'entire');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);
  const [outputMode, setOutputMode] = useState<'merge' | 'separate'>('merge');
  const [quality, setQuality] = useState<Mp3Quality>('vbr');

  const effectiveTimeRange = timeRange === 'selected' && segments.length === 0 ? 'entire' : timeRange;
  const effectiveSegments = effectiveTimeRange === 'selected' ? segments : [];
  const multiple = effectiveTimeRange === 'selected' && segments.length > 1;
  const { job, isStarting, isBusy, startExtraction, cancelExtraction, dismissJob } = useAudioExtractionJob({ filePath, selectedStreamIndexes, mode, quality, segments: effectiveSegments, outputMode });

  const isMp4 = useMemo(() => {
    const extensionIsMp4 = filePath?.toLowerCase().endsWith('.mp4') ?? false;
    const containerIsMp4 = (formatName ?? '').split(',').some((format) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format.trim()));
    return extensionIsMp4 && containerIsMp4;
  }, [filePath, formatName]);

  const selectedCount = selectedStreamIndexes.length;
  const segmentCount = Math.max(effectiveSegments.length, 1);
  const outputCount = selectedCount * (multiple && outputMode === 'merge' ? 1 : segmentCount);
  const handleOpenChange = (nextOpen: boolean) => onOpenChange(nextOpen);

  const toggleStream = (streamIndex: number, checked: boolean) => {
    setTrackSelection({
      source: filePath,
      indexes: checked
        ? (selectedStreamIndexes.includes(streamIndex) ? selectedStreamIndexes : [...selectedStreamIndexes, streamIndex])
        : selectedStreamIndexes.filter((index) => index !== streamIndex),
    });
  };

  return (
    <>
      <OutputFloatingPanel
        id="audio"
        open={open}
        title={t('Extract Audio Settings')}
        onClose={() => handleOpenChange(false)}
        footer={(
          <>
            <button
              type="button"
              className={actionStyles['action']}
              onClick={() => handleOpenChange(false)}
            >
              {t('Cancel')}
            </button>
            <button type="button" className={`${actionStyles['action']} ${actionStyles['primary']}`} disabled={!isMp4 || selectedCount === 0 || isBusy || (effectiveTimeRange === 'selected' && segments.length === 0)} onClick={() => { startExtraction().catch(console.error); }}>{t('Extract')}</button>
          </>
        )}
      >
      {!isMp4 && <p role="alert" style={{ color: 'var(--red-10)', marginTop: 0 }}>{t('This feature currently supports MP4 files only.')}</p>}

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

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.2em' }}>
          <strong>{t('Export')}</strong>
          <label className={styles['row']} htmlFor="audio-time-range"><span>{t('Time range')}</span>
            <select id="audio-time-range" value={effectiveTimeRange} disabled={isBusy} onChange={(event) => setTimeRange(event.target.value as 'selected' | 'entire')}>
              <option value="selected" disabled={segments.length === 0}>{t('Selected segments')}</option>
              <option value="entire">{t('Entire video')}</option>
            </select>
          </label>
          <label className={styles['row']} htmlFor="audio-output-mode"><span>{t('Output mode')}</span>
            <select id="audio-output-mode" value={outputMode} disabled={!multiple || isBusy} onChange={(event) => setOutputMode(event.target.value as 'merge' | 'separate')}>
              <option value="merge">{t('Merge into one file')}</option>
              <option value="separate">{t('Export separately')}</option>
            </select>
          </label>
          <label className={styles['row']} htmlFor="audio-output-format"><span>{t('Output format')}</span>
            <select id="audio-output-format" value={mode} disabled={isBusy} onChange={(event) => setMode(event.target.value as AudioExtractionMode)}>
              <option value="original">{t('Original format')}</option>
              <option value="mp3">{t('MP3 (re-encode)')}</option>
            </select>
          </label>
          <label className={styles['row']} htmlFor="audio-mp3-quality"><span>{t('MP3 quality')}</span>
            <select id="audio-mp3-quality" value={quality} disabled={mode === 'original' || isBusy} onChange={(event) => setQuality(event.target.value as Mp3Quality)}>
              <option value="vbr">{t('VBR (LAME Quality 2)')}</option>
              <option value="128k">128 kbps</option>
              <option value="192k">192 kbps</option>
              <option value="320k">320 kbps</option>
            </select>
          </label>
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
          {effectiveSegments.length === 0 ? (
            <div>{t('Entire video')}</div>
          ) : (
            <div style={{ maxHeight: '8em', overflowY: 'auto', paddingLeft: '1.5em' }}>
              {effectiveSegments.map((segment, index) => (
                <div key={`${segment.originalIndex}-${segment.start}-${segment.end}`}>
                  {t('Segment {{number}}', { number: index + 1 })}: {formatTime(segment.start)} – {formatTime(segment.end)}
                </div>
              ))}
            </div>
          )}
        </section>

        {isStarting && <div role="status" style={{ marginTop: '.6em' }}>{t('Preparing extraction...')}</div>}
      </OutputFloatingPanel>
      {job && (
        <AudioExtractionProgress
          key={job.id}
          job={job}
          onCancel={() => cancelExtraction()}
          onDismiss={dismissJob}
        />
      )}
    </>
  );
}

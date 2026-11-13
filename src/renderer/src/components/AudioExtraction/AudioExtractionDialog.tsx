import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as Dialog from '../Dialog';
import actionStyles from '../OutputActionButtons.module.css';
import chrome from '../OutputPanelChrome.module.css';
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

export default function AudioExtractionDialog({ open, onOpenChange, filePath, streams, segments, formatName }: AudioExtractionDialogProps) {
  const { t } = useTranslation();
  const [trackSelection, setTrackSelection] = useState<{ source: string | undefined; indexes: number[] }>();
  // The long-lived job presenter survives source changes. A new source gets
  // its own default track without resetting the currently running job.
  const selectedStreamIndexes = trackSelection?.source === filePath
    ? trackSelection.indexes : (streams[0] ? [streams[0].index] : []);
  const [mode, setMode] = useState<AudioExtractionMode>('mp3');
  const [quality, setQuality] = useState<Mp3Quality>('vbr');

  const { job, isStarting, isBusy, startExtraction, cancelExtraction, dismissJob } = useAudioExtractionJob({ filePath, selectedStreamIndexes, mode, quality, segments });

  const isMp4 = useMemo(() => {
    const extensionIsMp4 = filePath?.toLowerCase().endsWith('.mp4') ?? false;
    const containerIsMp4 = (formatName ?? '').split(',').some((format) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format.trim()));
    return extensionIsMp4 && containerIsMp4;
  }, [filePath, formatName]);

  const selectedCount = selectedStreamIndexes.length;
  const segmentCount = Math.max(segments.length, 1);
  const outputCount = selectedCount * segmentCount;
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isStarting) return;
    onOpenChange(nextOpen);
  };

  const beginExtraction = async () => {
    const started = await startExtraction();
    if (started) onOpenChange(false);
  };

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
                disabled={isStarting}
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
            </div>
            <div className={chrome['footer']}>
              <button
                type="button"
                className={actionStyles['action']}
                disabled={isStarting}
                onClick={() => handleOpenChange(false)}
              >
                {t('Cancel')}
              </button>
              <button type="button" className={`${actionStyles['action']} ${actionStyles['primary']}`} disabled={!isMp4 || selectedCount === 0 || isBusy} onClick={() => { beginExtraction().catch(console.error); }}>{t('Extract')}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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

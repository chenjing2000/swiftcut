import { FaFolderOpen } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface Props {
  directory: string | undefined;
  filename: string;
  onDirectoryChange: (value: string) => void;
  onFilenameChange: (value: string) => void;
  onChooseDirectory: () => void;
}

/** Two aligned, single-line editable outputs; the job validates before writing. */
export default function LosslessOutputFields({ directory, filename, onDirectoryChange, onFilenameChange, onChooseDirectory }: Props) {
  const { t } = useTranslation();
  const inputStyle = { width: '100%', minWidth: 0, boxSizing: 'border-box', textOverflow: 'clip' } as const;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) 28px', alignItems: 'center', gap: '8px', width: '100%' }}>
      <label htmlFor="lossless-output-directory">{t('Directory')}</label>
      <input id="lossless-output-directory" type="text" value={directory ?? ''} onChange={(event) => onDirectoryChange(event.target.value)} style={inputStyle} />
      <button type="button" title={t('Choose directory')} aria-label={t('Choose directory')} onClick={onChooseDirectory} style={{ padding: 3 }}><FaFolderOpen /></button>
      <label htmlFor="lossless-output-filename">{t('Filename')}</label>
      <input id="lossless-output-filename" type="text" value={filename} onChange={(event) => onFilenameChange(event.target.value)} style={inputStyle} />
    </div>
  );
}

import type { CSSProperties, MouseEventHandler } from 'react';
import { forwardRef } from 'react';
import { FiScissors } from 'react-icons/fi';
import { FaFileExport } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import type { SegmentToExport } from '../types';
import actionStyles from './OutputActionButtons.module.css';


interface Props {
  segmentsToExport: SegmentToExport[],
  areWeCutting: boolean,
  onClick: MouseEventHandler<HTMLButtonElement>,
  disabled?: boolean;
  style?: CSSProperties,
}

// eslint-disable-next-line react/display-name
const ExportButton = forwardRef<HTMLButtonElement, Props>(({
  segmentsToExport,
  areWeCutting,
  onClick,
  disabled = false,
  style,
}, ref) => {
  const CutIcon = areWeCutting ? FiScissors : FaFileExport;

  const { t } = useTranslation();

  const { autoMerge, simpleMode } = useUserSettings();

  let title = t('Export');
  if (segmentsToExport.length === 1) {
    title = t('Export selection');
  } else if (segmentsToExport.length > 1) {
    title = t('Export {{ num }} segments', { num: segmentsToExport.length });
  }

  const text = t(autoMerge && segmentsToExport && segmentsToExport.length > 1 ? 'Export+merge' : 'Export');

  return (
    <button
      ref={ref}
      type="button"
      className={[...(simpleMode ? ['export-animation'] : []), actionStyles['action'], actionStyles['primary']].join(' ')}
      style={style}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <CutIcon
        style={{ verticalAlign: 'middle', marginRight: '.2em' }}
      />
      {text}
    </button>
  );
});

export default ExportButton;

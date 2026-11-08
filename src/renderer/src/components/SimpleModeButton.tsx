import type { CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { primaryTextColor } from '../colors';
import useUserSettings from '../hooks/useUserSettings';
import styles from './SimpleModeButton.module.css';


function SimpleModeButton({ style }: { style?: CSSProperties } = {}) {
  const { t } = useTranslation();
  const { simpleMode, toggleSimpleMode } = useUserSettings();
  const label = t('Toggle advanced view');

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      title={label}
      onClick={toggleSimpleMode}
      style={{ color: simpleMode ? primaryTextColor : 'var(--gray-12)', ...style }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3.25" y="3.75" width="17.5" height="16.5" rx="2.5" />
        {simpleMode ? (
          <>
            <path d="M10 8.5 6.5 12 10 15.5" />
            <path d="M14 8.5 17.5 12 14 15.5" />
          </>
        ) : (
          <>
            <path d="M6.5 8.5 10 12 6.5 15.5" />
            <path d="M17.5 8.5 14 12 17.5 15.5" />
          </>
        )}
      </svg>
    </button>
  );
}

export default memo(SimpleModeButton);

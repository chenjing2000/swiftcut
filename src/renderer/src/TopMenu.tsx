import { memo } from 'react';
import { IoIosSettings } from 'react-icons/io';
import { FaMoon, FaSun } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import Button from './components/Button';
import { controlsBackground, darkModeTransition } from './colors';
import useUserSettings from './hooks/useUserSettings';
import useActionTitle from './hooks/useActionTitle';
import styles from './TopMenu.module.css';

function TopMenu({ toggleSettings, toggleDarkMode }: {
  toggleSettings: () => void,
  toggleDarkMode: () => void,
}) {
  const { t } = useTranslation();
  const { simpleMode, darkMode } = useUserSettings();
  const actionTitle = useActionTitle();
  const DarkMode = darkMode ? FaSun : FaMoon;

  return (
    <div
      className={`no-user-select ${styles['wrapper']}`}
      style={{ background: controlsBackground, transition: darkModeTransition, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.3em', padding: '.3em' }}
    >
      {!simpleMode && (
        <Button onClick={toggleDarkMode} title={actionTitle(t('Toggle dark mode'), 'toggleDarkMode')}>
          <DarkMode style={{ verticalAlign: 'middle', fontSize: '.9em' }} />
        </Button>
      )}
      <Button onClick={toggleSettings} title={actionTitle(t('Settings'), 'toggleSettings')}>
        <IoIosSettings style={{ fontSize: '1em', verticalAlign: 'bottom' }} />
      </Button>
    </div>
  );
}

export default memo(TopMenu);

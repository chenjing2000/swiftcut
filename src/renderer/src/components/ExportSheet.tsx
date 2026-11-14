import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import actionStyles from './OutputActionButtons.module.css';
import styles from './ExportSheet.module.css';
import OutputFloatingPanel from './OutputFloatingPanel';

function ExportSheet({
  visible,
  children,
  renderBottom,
  renderButton,
  onClosePress,
  title,
  width,
}: {
  visible: boolean,
  renderBottom?: (() => ReactNode | null) | undefined,
  renderButton: () => ReactNode | null,
  children: ReactNode,
  onClosePress: () => void,
  title: string,
  width: CSSProperties['width'],
}) {
  const { t } = useTranslation();
  return (
    <OutputFloatingPanel
      id="lossless-settings"
      open={visible}
      title={title}
      onClose={onClosePress}
      width={width}
      contentClassName={styles['contents']}
      footer={(
        <>
          {renderBottom?.()}
          <button className={actionStyles['action']} type="button" onClick={onClosePress}>{t('Cancel')}</button>
          {renderButton()}
        </>
      )}
    >
      {children}
    </OutputFloatingPanel>
  );
}

export default ExportSheet;

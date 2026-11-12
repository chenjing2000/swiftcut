import SwalRaw from 'sweetalert2/dist/sweetalert2.js';
import type { SweetAlertOptions } from 'sweetalert2';
import type { ReactSweetAlert, SweetAlert2 } from 'sweetalert2-react-content';
import withReactContent from 'sweetalert2-react-content';

import i18n from './i18n';
import { emitter as animationsEmitter } from './animations';
import { dialogButtonOrder } from './util';
import { showErrorNotification } from './notifications/notificationStore';

export const swalContainerWrapperId = 'swal2-container-wrapper';

let Swal: SweetAlert2;
let ReactSwal: SweetAlert2 & ReactSweetAlert;

function initSwal(reducedMotion = false) {
  const commonSwalOptions: SweetAlertOptions = {
    target: `#${swalContainerWrapperId}`,
    showClass: reducedMotion
      ? { popup: '', backdrop: '', icon: '' }
      : {
        popup: 'swiftcut-swal-show',
        backdrop: 'swiftcut-swal-backdrop-show',
        icon: 'swiftcut-swal-icon-show',
      },
    hideClass: reducedMotion
      ? { popup: '', backdrop: '', icon: '' }
      : {
        popup: 'swiftcut-swal-hide',
        backdrop: 'swiftcut-swal-backdrop-hide',
        icon: 'swiftcut-swal-icon-hide',
      },
    reverseButtons: dialogButtonOrder === 'ltr',
  };

  Swal = SwalRaw.mixin({
    ...commonSwalOptions,
  });


  ReactSwal = withReactContent(Swal);
}

animationsEmitter.on('reducedMotion', (reducedMotion) => initSwal(reducedMotion));

initSwal();

export default function getSwal() {
  return {
    Swal,
    ReactSwal,
  };
}

export const errorToast = (text: string) => showErrorNotification({
  title: i18n.t('Error'),
  message: text,
});

export const showPlaybackFailedMessage = () => errorToast(i18n.t('Unable to playback this file. Try to convert to supported format from the menu'));

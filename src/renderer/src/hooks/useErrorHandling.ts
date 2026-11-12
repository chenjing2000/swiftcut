import i18n from 'i18next';
import { useCallback } from 'react';

import { DirectoryAccessDeclinedError, UnsupportedFileError } from '../../errors';
import { isAbortedError } from '../util';
import { showErrorNotification } from '../notifications/notificationStore';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorDetails(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}

export default function useErrorHandling() {
  const handleError = useCallback(async ({ title, err }: { title?: string | undefined, err?: unknown | undefined }) => {
    console.error('handleError', title, err);
    const details = getErrorDetails(err);
    await showErrorNotification({
      title: title ?? i18n.t('Error'),
      message: getErrorMessage(err),
      ...(details && { details }),
      source: 'application-error',
    });
  }, []);

  /** Run an operation with error handling. The operation remains pending until the user acknowledges its error. */
  async function withErrorHandling(operation: () => Promise<void>, errorMsg?: string) {
    try {
      await operation();
    } catch (err) {
      if (err instanceof DirectoryAccessDeclinedError || isAbortedError(err)) return;

      if (err instanceof UnsupportedFileError) {
        console.error(err);
        await handleError({ title: errorMsg, err: i18n.t('Unsupported file') });
        return;
      }

      await handleError({ title: errorMsg, err });
    }
  }

  return {
    withErrorHandling,
    handleError,
  };
}

export type WithErrorHandling = ReturnType<typeof useErrorHandling>['withErrorHandling'];

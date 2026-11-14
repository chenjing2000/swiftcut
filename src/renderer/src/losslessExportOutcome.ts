export type LosslessErrorOutcome = 'published' | 'cancelled' | 'failed';

// Published media must never be reclassified as failed or cancelled.
// Before publication, a requested cancellation or an abort error wins.
export function classifyLosslessError({
  published, cancelRequested, aborted,
}: {
  published: boolean;
  cancelRequested: boolean;
  aborted: boolean;
}): LosslessErrorOutcome {
  if (published) return 'published';
  return cancelRequested || aborted ? 'cancelled' : 'failed';
}

// A completion listener is advisory. Its failure cannot invalidate media
// files, conceal the originating failure or interrupt task-owned cleanup.
export function emitLosslessCompletionSafely(
  emit: () => void,
  reportError: (error: unknown) => void,
): void {
  try {
    emit();
  } catch (error) {
    reportError(error);
  }
}

export type LosslessExportFinalState = 'success' | 'cancelled' | 'failed';

// A finished export remains visible on failure, while pre-start validation
// errors do not create a progress window.
export function getLosslessExportFinalState({
  started, published, cancelled,
}: {
  started: boolean;
  published: boolean;
  cancelled: boolean;
}): LosslessExportFinalState | undefined {
  if (published) return 'success';
  if (!started) return undefined;
  return cancelled ? 'cancelled' : 'failed';
}

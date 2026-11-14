// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it, vi } from 'vitest';
import { classifyLosslessError, emitLosslessCompletionSafely } from './losslessExportOutcome';

describe('Lossless export error outcome', () => {
  it('treats a pre-publication abort as cancelled', () => {
    expect(classifyLosslessError({ published: false, cancelRequested: false, aborted: true })).toBe('cancelled');
  });

  it('honors an explicit cancellation request even when the worker returns another error', () => {
    expect(classifyLosslessError({ published: false, cancelRequested: true, aborted: false })).toBe('cancelled');
  });

  it('keeps unrelated FFmpeg failures as failures before publication', () => {
    expect(classifyLosslessError({ published: false, cancelRequested: false, aborted: false })).toBe('failed');
  });

  it('never downgrades successfully published files following an abort or listener error', () => {
    expect(classifyLosslessError({ published: true, cancelRequested: true, aborted: true })).toBe('published');
    expect(classifyLosslessError({ published: true, cancelRequested: false, aborted: false })).toBe('published');
  });
});

describe('Lossless completion notification', () => {
  it('emits the event once when the listener succeeds', () => {
    const emit = vi.fn<() => void>();
    const reportError = vi.fn<(error: unknown) => void>();
    emitLosslessCompletionSafely(emit, reportError);
    expect(emit).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports listener errors without throwing or blocking subsequent task cleanup', () => {
    const failure = new Error('listener failed');
    const emit = vi.fn<() => void>(() => { throw failure; });
    const reportError = vi.fn<(error: unknown) => void>();
    expect(() => emitLosslessCompletionSafely(emit, reportError)).not.toThrow();
    expect(reportError).toHaveBeenCalledWith(failure);
  });
});

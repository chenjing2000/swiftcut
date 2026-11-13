// eslint-disable-next-line import-js/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { getCropExportPresentation } from './cropExportPresentation';

describe('crop export progress presentation', () => {
  it('keeps every active state open for progress and cancellation', () => {
    for (const state of ['preparing', 'encoding', 'merging', 'verifying', 'committing', 'cleaning'] as const) {
      expect(getCropExportPresentation({ state }).active).toBe(true);
    }
  });

  it('shows terminal outcomes without active progress controls', () => {
    expect(getCropExportPresentation({ state: 'success' })).toMatchObject({ active: false, title: 'Crop export completed' });
    expect(getCropExportPresentation({ state: 'partial_success' })).toMatchObject({ active: false, title: 'Crop export partially completed' });
    expect(getCropExportPresentation({ state: 'failed' }).active).toBe(false);
    expect(getCropExportPresentation({ state: 'cancelled' }).active).toBe(false);
  });
});

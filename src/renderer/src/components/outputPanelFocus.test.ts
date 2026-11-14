// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateOutputPanel, getOutputPanelZIndex, getOutputPanelsRevision,
  isActiveOutputPanel, registerOutputPanel, subscribeOutputPanels,
} from './outputPanelFocus';

afterEach(() => vi.unstubAllGlobals());

describe('Output floating window order', () => {
  it('brings the newly opened or activated window to the front', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() });
    const closeAudio = registerOutputPanel('audio');
    const closeCrop = registerOutputPanel('crop');
    const closeLossless = registerOutputPanel('lossless');

    try {
      expect(getOutputPanelZIndex('audio')).toBe(200);
      expect(getOutputPanelZIndex('crop')).toBe(201);
      expect(getOutputPanelZIndex('lossless')).toBe(202);
      expect(isActiveOutputPanel('lossless')).toBe(true);

      activateOutputPanel('audio');
      expect(isActiveOutputPanel('audio')).toBe(true);
      expect(getOutputPanelZIndex('audio')).toBe(202);
      expect(getOutputPanelZIndex('lossless')).toBe(201);

      closeAudio();
      expect(isActiveOutputPanel('lossless')).toBe(true);
      expect(getOutputPanelZIndex('crop')).toBe(200);
      expect(getOutputPanelZIndex('lossless')).toBe(201);
    } finally {
      closeLossless();
      closeCrop();
      closeAudio();
    }
  });

  it('notifies subscribers only when panel ordering changes', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() });
    const changes: number[] = [];
    const unsubscribe = subscribeOutputPanels(() => { changes.push(getOutputPanelsRevision()); });
    const closeAudio = registerOutputPanel('audio');
    const closeCrop = registerOutputPanel('crop');
    try {
      const before = changes.length;
      activateOutputPanel('crop');
      expect(changes).toHaveLength(before);
      activateOutputPanel('audio');
      expect(changes).toHaveLength(before + 1);
    } finally {
      closeCrop();
      closeAudio();
      unsubscribe();
    }
  });
});

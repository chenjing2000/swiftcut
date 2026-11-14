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
    const closeAudio = registerOutputPanel('audio-settings');
    const closeCrop = registerOutputPanel('crop-settings');
    const closeLossless = registerOutputPanel('lossless-settings');

    try {
      expect(getOutputPanelZIndex('audio-settings')).toBe(200);
      expect(getOutputPanelZIndex('crop-settings')).toBe(201);
      expect(getOutputPanelZIndex('lossless-settings')).toBe(202);
      expect(isActiveOutputPanel('lossless-settings')).toBe(true);

      activateOutputPanel('audio-settings');
      expect(isActiveOutputPanel('audio-settings')).toBe(true);
      expect(getOutputPanelZIndex('audio-settings')).toBe(202);
      expect(getOutputPanelZIndex('lossless-settings')).toBe(201);

      closeAudio();
      expect(isActiveOutputPanel('lossless-settings')).toBe(true);
      expect(getOutputPanelZIndex('crop-settings')).toBe(200);
      expect(getOutputPanelZIndex('lossless-settings')).toBe(201);
    } finally {
      closeLossless();
      closeCrop();
      closeAudio();
    }
  });


  it('treats all three settings and three progress windows as equal peers', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() });
    const ids = [
      'audio-settings', 'crop-settings', 'lossless-settings',
      'audio-progress', 'crop-progress', 'lossless-progress',
    ] as const;
    const close = ids.map((id) => registerOutputPanel(id));
    try {
      expect(getOutputPanelZIndex('audio-settings')).toBe(200);
      expect(getOutputPanelZIndex('lossless-progress')).toBe(205);
      activateOutputPanel('crop-progress');
      expect(isActiveOutputPanel('crop-progress')).toBe(true);
      expect(getOutputPanelZIndex('crop-progress')).toBe(205);
      activateOutputPanel('lossless-settings');
      expect(isActiveOutputPanel('lossless-settings')).toBe(true);
      expect(getOutputPanelZIndex('lossless-settings')).toBe(205);
      close[1]!();
      expect(getOutputPanelZIndex('lossless-settings')).toBe(204);
      expect(isActiveOutputPanel('lossless-settings')).toBe(true);
    } finally {
      close.forEach((dispose) => dispose());
    }
  });

  it('preserves activation order across content updates and reopens at the front', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() });
    const closeAudio = registerOutputPanel('audio-progress');
    const closeCrop = registerOutputPanel('crop-progress');
    try {
      const initialRevision = getOutputPanelsRevision();
      // Renders and status changes do not call registerOutputPanel.
      expect(getOutputPanelsRevision()).toBe(initialRevision);
      expect(isActiveOutputPanel('crop-progress')).toBe(true);
      closeAudio();
      const closeReopenedAudio = registerOutputPanel('audio-progress');
      try {
        expect(isActiveOutputPanel('audio-progress')).toBe(true);
      } finally {
        closeReopenedAudio();
      }
    } finally {
      closeCrop();
      closeAudio();
    }
  });

  it('notifies subscribers only when panel ordering changes', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() });
    const changes: number[] = [];
    const unsubscribe = subscribeOutputPanels(() => { changes.push(getOutputPanelsRevision()); });
    const closeAudio = registerOutputPanel('audio-settings');
    const closeCrop = registerOutputPanel('crop-settings');
    try {
      const before = changes.length;
      activateOutputPanel('crop-settings');
      expect(changes).toHaveLength(before);
      activateOutputPanel('audio-settings');
      expect(changes).toHaveLength(before + 1);
    } finally {
      closeCrop();
      closeAudio();
      unsubscribe();
    }
  });
});

// Only active-window keyboard ownership is shared; export jobs remain independent.
export type OutputPanel = 'audio' | 'crop' | 'lossless';

const openPanels: OutputPanel[] = [];

export function activateOutputPanel(panel: OutputPanel) {
  const index = openPanels.indexOf(panel);
  if (index !== -1) openPanels.splice(index, 1);
  openPanels.push(panel);
}

function activateFromEvent(event: Event) {
  const panel = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-output-panel]')?.dataset['outputPanel']
    : undefined;
  if (panel != null && openPanels.includes(panel as OutputPanel)) {
    activateOutputPanel(panel as OutputPanel);
  }
}

export function registerOutputPanel(panel: OutputPanel) {
  if (openPanels.length === 0) {
    document.addEventListener('pointerdown', activateFromEvent, { capture: true });
    document.addEventListener('focusin', activateFromEvent, { capture: true });
  }
  activateOutputPanel(panel);
  return () => {
    const index = openPanels.indexOf(panel);
    if (index !== -1) openPanels.splice(index, 1);
    if (openPanels.length === 0) {
      document.removeEventListener('pointerdown', activateFromEvent, { capture: true });
      document.removeEventListener('focusin', activateFromEvent, { capture: true });
    }
  };
}

export function isActiveOutputPanel(panel: OutputPanel) {
  return openPanels.at(-1) === panel;
}

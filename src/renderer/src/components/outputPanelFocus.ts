// Only Output window ordering and keyboard ownership are shared here.
// Each export feature owns its settings and job lifecycle independently.
export type OutputPanel =
  | 'audio-settings'
  | 'audio-progress'
  | 'crop-settings'
  | 'crop-progress'
  | 'lossless-settings'
  | 'lossless-progress';

const openPanels: OutputPanel[] = [];
const listeners = new Set<() => void>();
let revision = 0;

function notify() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeOutputPanels(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getOutputPanelsRevision() {
  return revision;
}

export function getOutputPanelZIndex(panel: OutputPanel) {
  const index = openPanels.indexOf(panel);
  return 200 + Math.max(0, index);
}

export function activateOutputPanel(panel: OutputPanel) {
  const index = openPanels.indexOf(panel);
  if (index === -1 || index === openPanels.length - 1) return;
  openPanels.splice(index, 1);
  openPanels.push(panel);
  notify();
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
  const oldIndex = openPanels.indexOf(panel);
  if (oldIndex !== -1) openPanels.splice(oldIndex, 1);
  openPanels.push(panel);
  notify();
  return () => {
    const index = openPanels.indexOf(panel);
    if (index !== -1) {
      openPanels.splice(index, 1);
      notify();
    }
    if (openPanels.length === 0) {
      document.removeEventListener('pointerdown', activateFromEvent, { capture: true });
      document.removeEventListener('focusin', activateFromEvent, { capture: true });
    }
  };
}

export function isActiveOutputPanel(panel: OutputPanel) {
  return openPanels.at(-1) === panel;
}

// Only keyboard ownership is shared; each Output feature keeps its own dialog
// and export lifecycle. Last activated, still-open panel receives Escape.
export type OutputPanel = 'audio' | 'crop' | 'lossless';

const openPanels: OutputPanel[] = [];

export function activateOutputPanel(panel: OutputPanel) {
  const index = openPanels.indexOf(panel);
  if (index >= 0) openPanels.splice(index, 1);
  openPanels.push(panel);
}

export function registerOutputPanel(panel: OutputPanel) {
  activateOutputPanel(panel);
  return () => {
    const index = openPanels.indexOf(panel);
    if (index >= 0) openPanels.splice(index, 1);
  };
}

export function isActiveOutputPanel(panel: OutputPanel) {
  return openPanels.at(-1) === panel;
}

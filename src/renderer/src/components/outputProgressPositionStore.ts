import type { OutputPanel } from './outputPanelFocus';

export type ProgressWindowId = Extract<OutputPanel, `${string}-progress`>;

export interface ProgressWindowPosition {
  left: number;
  top: number;
}

// Renderer-memory only: persisted across export jobs, never across app restarts.
const positions = new Map<ProgressWindowId, ProgressWindowPosition>();

export function getOutputProgressPosition(id: ProgressWindowId): ProgressWindowPosition | undefined {
  return positions.get(id);
}

export function setOutputProgressPosition(id: ProgressWindowId, position: ProgressWindowPosition) {
  positions.set(id, { ...position });
}

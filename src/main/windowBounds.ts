/** Only restore a saved window size when both dimensions fit the display work area. */
export function fitsWindowWorkArea(
  bounds: { width: number; height: number },
  area: { width: number; height: number },
) {
  return bounds.width <= area.width && bounds.height <= area.height;
}

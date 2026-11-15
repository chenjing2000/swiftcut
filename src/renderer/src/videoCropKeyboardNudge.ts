/** Calculate the keyboard translation for a selected crop region. */
export function getCropKeyboardNudge(key: string, shiftKey: boolean) {
  const delta = shiftKey ? 10 : 1;
  return {
    dx: key === 'ArrowLeft' ? -delta : (key === 'ArrowRight' ? delta : 0),
    dy: key === 'ArrowUp' ? -delta : (key === 'ArrowDown' ? delta : 0),
  };
}

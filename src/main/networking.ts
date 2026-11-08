let disableNetworking = true;

export const hasDisabledNetworking = () => disableNetworking;

export function throwIfDisabledNetworking() {
  if (hasDisabledNetworking()) {
    throw new Error('Network access is disabled. Enable it in Settings to use online media sources.');
  }
}

export function setDisableNetworking(value: boolean) {
  disableNetworking = value;
}

export function shouldBlockNetworkUrl(rawUrl: string, allowLoopback = false) {
  if (!hasDisabledNetworking()) return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replaceAll(/^\[|\]$/g, '');
  return !(allowLoopback && ['localhost', '127.0.0.1', '::1'].includes(host));
}

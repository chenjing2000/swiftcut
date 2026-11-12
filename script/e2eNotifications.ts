/* eslint-disable no-console */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const httpPort = 18081;
const debuggingPort = 19222;
const baseUrl = `http://127.0.0.1:${httpPort}`;
const artifactDirectory = join('artifacts', 'notification-e2e');

const pending = new Map<number, {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}>();

let nextMessageId = 0;
let socket: WebSocket | undefined;
let appProcessExit: { exitCode: number | null | undefined; error?: unknown } | undefined;

function logStage(stage: string) {
  console.log(`[notification-e2e] ${new Date().toISOString()} ${stage}`);
}

function connectToCdp(url: string) {
  interface CdpResponse {
    id?: number;
    result?: Record<string, unknown>;
    error?: { message: string };
  }

  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    const connectionTimeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timed out connecting to Electron DevTools WebSocket'));
    }, 8000);
    ws.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(connectionTimeout);
      reject(new Error('Failed to connect to Electron DevTools Protocol'));
    }, { once: true });
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse & {
        method?: string;
        params?: Record<string, unknown>;
      };
      if (message.id == null) {
        if (message.method === 'Runtime.exceptionThrown') {
          console.error('[notification-e2e] Renderer exception:', JSON.stringify(message.params));
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.['type'] === 'error') {
          console.error('[notification-e2e] Renderer console error:', JSON.stringify(message.params));
        }
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result ?? {});
    });
    ws.addEventListener('close', () => {
      for (const request of pending.values()) request.reject(new Error('CDP connection closed'));
      pending.clear();
    });
  });
}

function cdp(method: string, params: Record<string, unknown> = {}) {
  const ws = socket;
  assert.ok(ws);
  nextMessageId += 1;
  const id = nextMessageId;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 8000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function evaluate<T>(expression: string): Promise<T> {
  const { exceptionDetails, result } = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(`Renderer evaluation failed: ${JSON.stringify(exceptionDetails)}`);
  const evaluated = result as { value?: T } | undefined;
  return evaluated?.value as T;
}

async function waitFor<T>(callback: () => Promise<T | undefined | false>, description: string, timeoutMs = 15000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback();
    if (value !== undefined && value !== false) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForExpression(expression: string, description: string, timeoutMs = 15000) {
  return waitFor(async () => {
    const value = await evaluate<boolean | undefined>(expression);
    return value || undefined;
  }, description, timeoutMs);
}

async function postNotification(payload: {
  type: 'information' | 'success' | 'warning' | 'error' | 'confirmation';
  title?: string;
  message: string;
  details?: string;
}) {
  await evaluate(`window.swiftcutNotificationE2E.send(${JSON.stringify(payload)})`);
  return { status: 200 };
}

async function captureScreenshot(name: string) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (typeof data !== 'string') throw new Error('Screenshot data was not returned by DevTools');
  await writeFile(join(artifactDirectory, name), Buffer.from(data, 'base64'));
}

async function waitForToast(type: string) {
  const selector = '[data-testid=notification-toast]';
  await waitForExpression(
    `(() => { const el = document.querySelector('${selector}'); return el?.dataset.type === ${JSON.stringify(type)} && el.dataset.phase === 'visible'; })()`,
    `${type} toast to become visible`,
  );
}

async function getToastMetrics() {
  return evaluate<{
    width: number;
    minWidth: string;
    maxWidth: string;
    transitionDuration: string;
    messageFits: boolean;
    iconColor: string;
  }>(`(() => {
    const card = document.querySelector('[data-testid=notification-toast]');
    if (!card) return null;
    const message = card.querySelector('[data-testid=notification-message]');
    const icon = card.querySelector('svg[data-type]');
    const style = getComputedStyle(card);
    return {
      width: card.getBoundingClientRect().width,
      minWidth: card.style.minWidth,
      maxWidth: card.style.maxWidth,
      transitionDuration: style.transitionDuration,
      messageFits: !message || message.scrollWidth <= message.clientWidth + 1,
      iconColor: icon ? getComputedStyle(icon).color : '',
    };
  })()`);
}

async function testTransientNotification(type: 'information' | 'success' | 'warning') {
  const response = await postNotification({
    type,
    title: `${type} notification`,
    message: `Automated desktop UI test for the ${type} notification.`,
  });
  assert.equal(response.status, 200, `Failed to enqueue ${type} notification`);

  await waitForToast(type);
  const metrics = await getToastMetrics();
  assert.equal(metrics.width, 360, `${type} notification should be 360 CSS px wide`);
  assert.equal(metrics.transitionDuration, '0.6s', 'Toast opacity transition should last 0.6 seconds');
  assert.ok(metrics.minWidth.includes('300px') && metrics.minWidth.includes('90vw'));
  assert.ok(metrics.maxWidth.includes('480px') && metrics.maxWidth.includes('90vw'));
  assert.equal(metrics.messageFits, true, 'Notification message should not overflow horizontally');
  assert.ok(metrics.iconColor.length > 0, 'Notification icon should have a computed color');

  await captureScreenshot(`toast-${type}.png`);
  await waitForExpression(
    '!document.querySelector("[data-testid=notification-toast]")',
    `${type} toast to auto-dismiss after its visible interval`,
    8000,
  );
  console.log(`PASS transient notification: ${type}`);
}

async function testHoverPauseAndNarrowViewport() {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const response = await postNotification({
    type: 'information',
    title: 'Hover pause',
    message: 'This notification must remain visible while the pointer is over it.',
  });
  assert.equal(response.status, 200);
  await waitForToast('information');
  await delay(2000);

  const metrics = await evaluate<{ width: number; maxWidth: string }>(`(() => {
    const card = document.querySelector('[data-testid=notification-toast]');
    if (!card) return null;
    return { width: card.getBoundingClientRect().width, maxWidth: getComputedStyle(card).maxWidth };
  })()`);
  assert.ok(metrics.width <= 320 * 0.9 + 1, 'Toast should fit within 90% of a narrow viewport');
  assert.ok(metrics.width < 300, 'The 90vw constraint should take precedence when the viewport is narrow');
  await captureScreenshot('toast-narrow-viewport.png');

  const rect = await evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
    const card = document.querySelector('[data-testid=notification-toast]');
    const r = card.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  await cdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });

  await delay(5500);
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-toast]"))',
    'toast to remain visible while hovered',
  );

  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await delay(2500);
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-toast]"))',
    'toast to remain visible for its remaining hold time after hover',
  );
  await waitForExpression(
    '!document.querySelector("[data-testid=notification-toast]")',
    'toast to dismiss after the remaining hold time',
    1500,
  );

  await cdp('Emulation.clearDeviceMetricsOverride');
  console.log('PASS hover pause and narrow viewport');
}

async function testDarkThemeStyles() {
  const response = await postNotification({
    type: 'information',
    title: 'Theme style check',
    message: 'Checking the dark-theme notification style.',
  });
  assert.equal(response.status, 200);
  await waitForToast('information');

  const colors = await evaluate<{ light: string; dark: string }>(`(() => {
    const root = document.querySelector('#app-root');
    const themeWrapper = root.parentElement;
    const card = document.querySelector('[data-testid=notification-toast]');
    const wasDark = themeWrapper.classList.contains('dark-theme');
    themeWrapper.classList.remove('dark-theme');
    const light = getComputedStyle(card).backgroundColor;
    themeWrapper.classList.add('dark-theme');
    const dark = getComputedStyle(card).backgroundColor;
    root.dataset.e2eRestoreDarkTheme = String(wasDark);
    return { light, dark };
  })()`);
  assert.notEqual(colors.light, colors.dark, 'Dark-theme CSS should change the toast background');
  await captureScreenshot('toast-dark-theme-style.png');
  await evaluate(`(() => {
    const root = document.querySelector('#app-root');
    if (root.dataset.e2eRestoreDarkTheme === 'false') root.parentElement.classList.remove('dark-theme');
    delete root.dataset.e2eRestoreDarkTheme;
  })()`);
  await waitForExpression(
    '!document.querySelector("[data-testid=notification-toast]")',
    'theme-check toast to auto-dismiss',
    8000,
  );
  console.log('PASS dark-theme style override');
}

async function testBlockingPriorityAndQueueOrder() {
  const activeResponse = await postNotification({
    type: 'information',
    title: 'Active notification',
    message: 'This message must not be interrupted.',
  });
  assert.equal(activeResponse.status, 200);
  await waitForToast('information');

  const queuedResponse = await postNotification({
    type: 'success',
    title: 'Queued notification',
    message: 'This message should wait until the blocking error is acknowledged.',
  });
  assert.equal(queuedResponse.status, 200);

  const errorRequest = postNotification({
    type: 'error',
    title: 'Priority error',
    message: 'A blocking error must be shown before queued transient messages.',
  });

  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-toast]"))',
    'active toast to remain visible while a blocking error is queued',
  );
  const activeText = await evaluate<string>('document.querySelector("[data-testid=notification-toast] [data-testid=notification-message]")?.textContent ?? ""');
  assert.ok(activeText.includes('must not be interrupted'), 'A queued blocking error must not interrupt the active toast');
  assert.equal(await evaluate<boolean>('!document.querySelector("[data-testid=notification-modal]")'), true);

  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'blocking error to become active after the current toast',
    10000,
  );
  await evaluate('document.querySelector("[data-testid=notification-primary-action]").click()');
  assert.equal((await errorRequest).status, 200);
  assert.equal(await evaluate<string>('document.documentElement.dataset.e2eLastErrorAction'), 'acknowledge');

  await waitForToast('success');
  const queuedText = await evaluate<string>('document.querySelector("[data-testid=notification-toast] [data-testid=notification-message]")?.textContent ?? ""');
  assert.ok(queuedText.includes('wait until the blocking error is acknowledged'));
  await waitForExpression(
    '!document.querySelector("[data-testid=notification-toast]")',
    'queued notification to finish',
    8000,
  );
  console.log('PASS blocking notification priority and queue order');
}

async function testBlockingNotifications() {
  const longMessage = 'Long diagnostic message for notification wrapping. '.repeat(30);
  const longDetails = 'FFmpeg diagnostic output line. '.repeat(300);
  const errorRequest = postNotification({
    type: 'error',
    title: 'Automated error notification',
    message: longMessage,
    details: longDetails,
  });

  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'error notification dialog',
  );

  const errorMetrics = await evaluate<{
    width: number;
    messageFits: boolean;
    transitionDuration: string;
  }>(`(() => {
    const modal = document.querySelector('[data-testid=notification-modal]');
    const message = modal.querySelector('[data-testid=notification-message]');
    return {
      width: modal.getBoundingClientRect().width,
      messageFits: message.scrollWidth <= message.clientWidth + 1,
      transitionDuration: getComputedStyle(modal).transitionDuration,
    };
  })()`);
  assert.equal(errorMetrics.width, 360, 'Error dialog should be 360 CSS px wide');
  assert.equal(errorMetrics.messageFits, true, 'Long error message should wrap without horizontal overflow');
  assert.equal(errorMetrics.transitionDuration, '0.6s');

  await evaluate('document.querySelector("[data-testid=notification-modal] details summary").click()');
  await evaluate('document.querySelector("[data-testid=notification-copy-details]").click()');
  const detailsMetrics = await evaluate<{ scrollHeight: number; clientHeight: number }>(`(() => {
    const details = document.querySelector('[data-testid=notification-modal] [data-testid=notification-details-text]');
    return { scrollHeight: details.scrollHeight, clientHeight: details.clientHeight };
  })()`);
  assert.ok(detailsMetrics.scrollHeight > detailsMetrics.clientHeight, 'Long technical details should be scrollable');

  await captureScreenshot('notification-error-dialog.png');
  await delay(6500);
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'error dialog to remain open without auto-dismissal',
  );
  await evaluate('document.querySelector("[data-testid=notification-primary-action]").click()');
  const errorResponse = await errorRequest;
  assert.equal(errorResponse.status, 200);
  assert.equal(await evaluate<string>('document.documentElement.dataset.e2eLastErrorAction'), 'acknowledge');
  await waitForExpression('!document.querySelector("[data-testid=notification-modal]")', 'error dialog to close');

  const cancelRequest = postNotification({
    type: 'confirmation',
    title: 'Cancel confirmation',
    message: 'Choose Cancel to resolve this confirmation as false.',
  });
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'confirmation dialog for cancel action',
  );
  assert.equal(
    await evaluate<number>('document.querySelector("[data-testid=notification-modal]").getBoundingClientRect().width'),
    360,
    'Confirmation dialog should be 360 CSS px wide',
  );
  await captureScreenshot('notification-confirmation-dialog.png');
  await delay(5500);
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'confirmation dialog to remain open without auto-dismissal',
  );
  await evaluate('document.querySelector("[data-testid=notification-secondary-action]").click()');
  assert.equal((await cancelRequest).status, 200);
  assert.equal(await evaluate<boolean>('document.documentElement.dataset.e2eLastConfirmationResult === "true"'), false);
  await waitForExpression('!document.querySelector("[data-testid=notification-modal]")', 'cancelled confirmation to close');

  const confirmRequest = postNotification({
    type: 'confirmation',
    title: 'Confirm confirmation',
    message: 'Choose Confirm to resolve this confirmation as true.',
  });
  await waitForExpression(
    'Boolean(document.querySelector("[data-testid=notification-modal]"))',
    'confirmation dialog for confirm action',
  );
  await evaluate('document.querySelector("[data-testid=notification-primary-action]").click()');
  assert.equal((await confirmRequest).status, 200);
  assert.equal(await evaluate<boolean>('document.documentElement.dataset.e2eLastConfirmationResult === "true"'), true);
  await waitForExpression('!document.querySelector("[data-testid=notification-modal]")', 'confirmed dialog to close');

  console.log('PASS error and confirmation dialogs');
}

const vite = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: httpPort, strictPort: true },
});
await vite.listen();

const browserProfile = await mkdtemp(join(tmpdir(), 'swiftcut-notification-browser-'));
const chromePath = process.env['CHROME_BIN']
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'google-chrome');

logStage(`Launching headless Chromium: ${chromePath}`);
const appProcess = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${debuggingPort}`,
  '--window-size=1280,800',
  `--user-data-dir=${browserProfile}`,
  `${baseUrl}/notification-e2e.html`,
], {
  env: process.env,
  windowsHide: true,
  stdio: 'inherit',
});
appProcess.on('exit', (exitCode) => { appProcessExit = { exitCode }; });
appProcess.on('error', (error) => { appProcessExit = { exitCode: null, error }; });

try {
  await mkdir(artifactDirectory, { recursive: true });
  logStage('Waiting for headless Chromium DevTools target');

  const targets = await waitFor(async () => {
    if (appProcessExit) throw new Error(`Chromium exited before DevTools became available: ${JSON.stringify(appProcessExit)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (!response.ok) return undefined;
      const items = await response.json() as { type: string; url: string; title?: string; webSocketDebuggerUrl: string }[];
      return items.find((item) => item.type === 'page' && item.webSocketDebuggerUrl && item.url.includes('notification-e2e.html'));
    } catch {
      return undefined;
    }
  }, 'Electron DevTools Protocol target', 30000);

  logStage(`Connecting DevTools target: ${targets.url}`);
  socket = await connectToCdp(targets.webSocketDebuggerUrl);
  logStage('Connected to renderer DevTools');
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  logStage('Probing JavaScript execution in renderer');
  const probe = await cdp('Runtime.evaluate', { expression: '1 + 1', returnByValue: true, awaitPromise: false });
  logStage(`Renderer JavaScript probe: ${JSON.stringify(probe)}`);
  logStage('Waiting for renderer E2E action listener');
  const initialDom = await evaluate<string>('document.body?.innerText?.slice(0, 600) ?? "(empty)"');
  logStage(`Initial document text: ${initialDom}`);
  await waitForExpression(
    'document.documentElement.dataset.e2eActionsReady === "true"',
    'renderer E2E action listener to become ready',
  );

  logStage('Starting notification test cases');
  await testTransientNotification('information');
  await testTransientNotification('success');
  await testTransientNotification('warning');
  await testHoverPauseAndNarrowViewport();
  await testDarkThemeStyles();
  await testBlockingPriorityAndQueueOrder();
  await testBlockingNotifications();

  logStage('All notification desktop E2E tests passed');
} catch (error) {
  console.error('[notification-e2e] Test failure:', error);
  try {
    if (socket?.readyState === WebSocket.OPEN) await captureScreenshot('failure.png');
  } catch (screenshotError) {
    console.error('[notification-e2e] Could not capture failure screenshot:', screenshotError);
  }
  throw error;
} finally {
  logStage('Cleaning up Chromium and Vite test server');
  socket?.close();
  if (appProcess.exitCode == null && appProcess.signalCode == null) {
    if (process.platform === 'win32' && appProcess.pid != null) {
      const terminated = spawnSync('taskkill', ['/PID', String(appProcess.pid), '/T', '/F'], {
        timeout: 5000,
        windowsHide: true,
        stdio: 'ignore',
      });
      if (terminated.error) console.warn('[notification-e2e] taskkill failed:', terminated.error);
    } else {
      appProcess.kill();
    }
  }
  await vite.close();
  await rm(browserProfile, { recursive: true, force: true, maxRetries: 2 });
  logStage('Cleanup complete');
}

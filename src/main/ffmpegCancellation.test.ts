// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortFfmpegs, runFfmpeg } from './ffmpeg.js';

const mocks = vi.hoisted(() => ({
  processes: [] as { signal: AbortSignal; finish: () => void }[],
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
  clipboard: {},
  ClipboardItem: () => undefined,
  nativeImage: {},
}));
vi.mock('./util.js', () => ({
  platform: 'win32',
  arch: 'x64',
  isWindows: true,
  isLinux: false,
}));
vi.mock('./isDev.js', () => ({ default: true }));
vi.mock('./logger.js', () => ({
  default: { info: vi.fn<(...args: unknown[]) => void>(), warn: vi.fn<(...args: unknown[]) => void>(), error: vi.fn<(...args: unknown[]) => void>() },
}));
vi.mock('execa', () => ({
  execa: vi.fn<(_path: string, _args: readonly string[], options: { cancelSignal: AbortSignal }) => Promise<void>>((_path, _args, options) => {
    let finish: () => void = () => undefined;
    const command = new Promise<void>((resolve, reject) => {
      finish = resolve;
      options.cancelSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      if (options.cancelSignal.aborted) reject(new Error('aborted'));
    });
    mocks.processes.push({ signal: options.cancelSignal, finish });
    return command;
  }),
}));

afterEach(() => {
  mocks.processes.forEach(({ finish }) => finish());
  mocks.processes.length = 0;
});

describe('FFmpeg cancellation ownership', () => {
  it('does not abort a caller-owned process when legacy global cancel runs', async () => {
    const ownedController = new AbortController();
    const legacy = runFfmpeg(['-version']);
    const owned = runFfmpeg(['-version'], { cancelSignal: ownedController.signal });
    expect(mocks.processes).toHaveLength(2);

    abortFfmpegs();
    expect(mocks.processes[0]!.signal.aborted).toBe(true);
    expect(mocks.processes[1]!.signal.aborted).toBe(false);

    ownedController.abort();
    await expect(legacy).rejects.toThrow('aborted');
    await expect(owned).rejects.toThrow('aborted');
  });

  it('aborts only the selected caller-owned process', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = runFfmpeg(['-version'], { cancelSignal: firstController.signal });
    const second = runFfmpeg(['-version'], { cancelSignal: secondController.signal });
    expect(mocks.processes).toHaveLength(2);

    firstController.abort();
    expect(mocks.processes[0]!.signal.aborted).toBe(true);
    expect(mocks.processes[1]!.signal.aborted).toBe(false);
    await expect(first).rejects.toThrow('aborted');

    mocks.processes[1]!.finish();
    await expect(second).resolves.toBeUndefined();
  });
});

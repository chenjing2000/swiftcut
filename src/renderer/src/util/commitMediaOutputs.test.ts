// eslint-disable-next-line import-js/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

let root: string;

beforeEach(async () => {
  vi.stubGlobal('window', {
    require: (name: string) => {
      if (name === 'node:fs/promises') return fs;
      if (name === 'node:path') return path;
      throw new Error(`Unexpected Node import: ${name}`);
    },
  });
  root = await fs.mkdtemp(path.join(tmpdir(), 'swiftcut-output-'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(root, { recursive: true, force: true });
});

describe('safe media output publication', () => {
  it('never replaces an existing output and uses one suffix for an entire batch', async () => {
    const { commitMediaOutputs } = await import('./commitMediaOutputs.js');
    const original = path.join(root, 'Travel_segment_01.mp4');
    await fs.writeFile(original, 'original');
    const one = path.join(root, 'temp1.mp4');
    const two = path.join(root, 'temp2.mp4');
    await fs.writeFile(one, 'new 1');
    await fs.writeFile(two, 'new 2');
    const files = await commitMediaOutputs({
      outputDir: root,
      outputs: [
        { temporaryPath: one, requestedName: 'Travel_segment_01.mp4' },
        { temporaryPath: two, requestedName: 'Travel_segment_02.mp4' },
      ],
    });
    expect(files.map((file) => path.basename(file))).toStrictEqual([
      'Travel_segment_01 (1).mp4', 'Travel_segment_02 (1).mp4',
    ]);
    await expect(fs.readFile(original, 'utf8')).resolves.toBe('original');
    await expect(fs.readFile(files[0]!, 'utf8')).resolves.toBe('new 1');
    await expect(fs.readFile(files[1]!, 'utf8')).resolves.toBe('new 2');
  });

  it('rejects a directory traversal filename without writing output', async () => {
    const { commitMediaOutputs } = await import('./commitMediaOutputs.js');
    const staged = path.join(root, 'staged.mp4');
    await fs.writeFile(staged, 'clip');
    await expect(commitMediaOutputs({
      outputDir: root,
      outputs: [{ temporaryPath: staged, requestedName: '../escape.mp4' }],
    })).rejects.toThrow('Invalid output filename');
    await expect(fs.readFile(staged, 'utf8')).resolves.toBe('clip');
  });
});

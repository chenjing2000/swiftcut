import { join } from './path';

const { link, stat, unlink } = window.require('node:fs/promises');
import { assertOutputFilename, findAvailableBatchNames } from '../../common/mediaWorkspace.js';

function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error != null && 'code' in error ? error.code : undefined;
}

/** Commit completed temporary files without ever replacing existing user files. */
export async function commitMediaOutputs({
  outputDir, outputs,
}: {
  outputDir: string;
  outputs: readonly { temporaryPath: string; requestedName: string }[];
}): Promise<string[]> {
  if (outputs.length === 0) throw new Error('No media output files to commit');
  const names = outputs.map(({ requestedName }) => {
    assertOutputFilename(requestedName);
    return requestedName;
  });
  for (let retry = 0; retry < 10000; retry += 1) {
    const candidates = await findAvailableBatchNames(names, async (name) => {
      try { await stat(join(outputDir, name)); return true; } catch (error) {
        if (getErrorCode(error) === 'ENOENT') return false;
        throw error;
      }
    });
    const committed: string[] = [];
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const target = join(outputDir, candidates[index]!);
        await link(outputs[index]!.temporaryPath, target);
        committed.push(target);
      }
      await Promise.all(outputs.map(({ temporaryPath }) => unlink(temporaryPath)));
      return committed;
    } catch (error) {
      // A concurrent writer raced the planning check. Remove only links created
      // by this invocation before choosing another entire-batch sequence.
      if (getErrorCode(error) !== 'EEXIST') throw error;
      await Promise.all(committed.map((target) => unlink(target)));
    }
  }
  throw new Error('No available output filename batch');
}

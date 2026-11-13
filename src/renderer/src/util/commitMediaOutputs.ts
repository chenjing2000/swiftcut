import { join } from './path';
import { assertOutputFilename, findAvailableBatchNames } from '../../../common/mediaWorkspace.js';

const { link, stat, unlink } = window.require('node:fs/promises');

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
      for (const [index, output] of outputs.entries()) {
        const target = join(outputDir, candidates[index]!);
        await link(output.temporaryPath, target);
        committed.push(target);
      }
      // Publication is complete once every hard link has been created.
      // Failure to delete a task-owned temporary link must not mark already
      // published user files as a failed export.
      const cleanup = await Promise.allSettled(outputs.map(({ temporaryPath }) => unlink(temporaryPath)));
      for (const outcome of cleanup) {
        if (outcome.status === 'rejected') console.warn('Cannot remove published temporary media link', outcome.reason);
      }
      return committed;
    } catch (error) {
      // Roll back only files linked by this invocation. A failure during a
      // batch must not strand anonymous partial outputs or replace old ones.
      const rollback = await Promise.allSettled(committed.map((target) => unlink(target)));
      const rollbackFailure = rollback.find((result) => result.status === 'rejected');
      if (rollbackFailure?.status === 'rejected') {
        throw new Error(`Output batch rollback failed; files may remain: ${committed.join(', ')}`, { cause: rollbackFailure.reason });
      }
      if (getErrorCode(error) !== 'EEXIST') throw error;
    }
  }
  throw new Error('No available output filename batch');
}

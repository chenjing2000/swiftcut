// Pure path and filename rules shared by renderer and main process.
// Directory creation is deliberately handled by each export service.
export type MediaExportKind = 'lossless' | 'crop';
export type MediaExportMode = 'entire' | 'segment' | 'merge' | 'chapters';

export function getSourceStem(sourcePath: string): string {
  const base = sourcePath.split(/[\\/]/).at(-1) ?? '';
  const stem = base.replace(/\.[^.]+$/, '');
  if (!stem || stem === '.' || stem === '..') throw new Error('Invalid source filename');
  return stem;
}

export function getMediaWorkspaceDir(sourcePath: string): string {
  const index = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  if (index < 0) throw new Error('Expected an absolute source path');
  return `${sourcePath.slice(0, index + 1)}${getSourceStem(sourcePath)}`;
}

export function getMediaOutputDir(sourcePath: string, kind: MediaExportKind): string {
  const workspace = getMediaWorkspaceDir(sourcePath);
  const sep = sourcePath.includes('\\') ? '\\' : '/';
  return `${workspace}${sep}${kind === 'lossless' ? 'Lossless' : 'Croploss'}`;
}

export function assertOutputFilename(filename: string): void {
  if (!filename || filename === '.' || filename === '..'
    || (/[\\/:*?"<>|]/.test(filename) || Array.from(filename).some((character) => character.codePointAt(0)! < 32))
    || /[. ]$/.test(filename)
    || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(filename)) {
    throw new Error('Invalid output filename');
  }
}

export function getMediaOutputName({
  sourcePath, kind, mode, extension, segmentIndex, segmentCount,
}: {
  sourcePath: string;
  kind: MediaExportKind;
  mode: MediaExportMode;
  extension: string;
  segmentIndex?: number;
  segmentCount?: number;
}): string {
  const stem = getSourceStem(sourcePath);
  if (!/^[a-zA-Z0-9]+$/.test(extension)) throw new Error('Invalid output extension');
  let name: string;
  switch (mode) {
    case 'entire': {
      name = `${stem}_${kind === 'lossless' ? 'lossless' : 'croploss'}`;
      break;
    }
    case 'segment': {
      if (segmentIndex == null || segmentCount == null || !Number.isSafeInteger(segmentIndex)
        || !Number.isSafeInteger(segmentCount) || segmentCount < 1 || segmentIndex < 1 || segmentIndex > segmentCount) {
        throw new Error('Invalid segment index');
      }
      const width = Math.max(2, String(segmentCount).length);
      name = `${stem}_segment_${String(segmentIndex).padStart(width, '0')}`;
      break;
    }
    case 'merge': {
      name = `${stem}_segments_merge`;
      break;
    }
    case 'chapters': {
      name = `${stem}_chapters`;
      break;
    }
    default: {
      throw new Error('Invalid export mode');
    }
  }
  const filename = `${name}.${extension}`;
  assertOutputFilename(filename);
  return filename;
}

export function withCollisionSuffix(filename: string, attempt: number): string {
  assertOutputFilename(filename);
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new Error('Invalid collision sequence');
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) throw new Error('Missing output extension');
  return `${filename.slice(0, dot)}${attempt === 0 ? '' : ` (${attempt})`}${filename.slice(dot)}`;
}

/** All members of a batch receive the same collision sequence. */
export async function findAvailableBatchNames(
  names: readonly string[],
  exists: (name: string) => Promise<boolean>,
): Promise<string[]> {
  if (names.length === 0 || new Set(names).size !== names.length) throw new Error('Invalid export batch');
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidates = names.map((name) => withCollisionSuffix(name, attempt));
    if ((await Promise.all(candidates.map((candidate) => exists(candidate)))).every((present) => !present)) return candidates;
  }
  throw new Error('No available export filenames');
}

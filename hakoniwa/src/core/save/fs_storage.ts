// SaveStorage over node:fs (release_engineering.md 5.2 and 5.4): the file save backend of
// the desktop main process (desktop/ wraps it in a ContainerBackend behind hk:save.*) and
// of the tests. Node only: never import it from the game page; the barrel does not export
// it. Writes fsync the file before returning; renames retry 100, 300 and 900 ms when an
// antivirus scanner holds the file on Windows (EPERM, EBUSY, EACCES), then give up.

import { mkdir, open, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { assertSafePath, type SaveStorage, type StoredStat } from './storage';

export const RENAME_RETRY_MS: readonly number[] = [100, 300, 900];
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function code(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class NodeFsStorage implements SaveStorage {
  /** the saves directory, for example `<userData>/saves` (absolute, normalised) */
  readonly root: string;

  constructor(
    root: string,
    private readonly retryMs: readonly number[] = RENAME_RETRY_MS,
  ) {
    this.root = resolve(root);
  }

  private abs(path: string): string {
    assertSafePath(path);
    return join(this.root, ...path.split('/'));
  }

  async read(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.abs(path)));
    } catch (err) {
      if (code(err) === 'ENOENT') return null;
      throw err;
    }
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const file = this.abs(path);
    await mkdir(dirname(file), { recursive: true });
    const handle = await open(file, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const src = this.abs(from);
    const dst = this.abs(to);
    await mkdir(dirname(dst), { recursive: true });
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(src, dst);
        break;
      } catch (err) {
        const wait = this.retryMs[attempt];
        if (wait === undefined || !RETRY_CODES.has(code(err) ?? '')) throw err;
        await sleep(wait);
      }
    }
    await syncDir(dirname(dst));
  }

  async remove(path: string): Promise<void> {
    const file = this.abs(path);
    await rm(file, { force: true });
    // Collection empties trash/<stamp>/runs/<run>/... directories; take them away too.
    for (let dir = dirname(file); dir !== this.root && dir.startsWith(this.root); ) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  }

  async list(dir: string): Promise<string[]> {
    const base = this.abs(dir);
    const out: string[] = [];
    const walk = async (d: string): Promise<void> => {
      let names: string[];
      try {
        names = await readdir(d);
      } catch (err) {
        if (code(err) === 'ENOENT' || code(err) === 'ENOTDIR') return;
        throw err;
      }
      for (const name of names) {
        const p = join(d, name);
        const st = await stat(p).catch(() => null);
        if (!st) continue;
        if (st.isDirectory()) await walk(p);
        else out.push(relative(this.root, p).split(sep).join('/'));
      }
    };
    await walk(base);
    return out.sort();
  }

  async stat(path: string): Promise<StoredStat | null> {
    try {
      const st = await stat(this.abs(path));
      return st.isFile() ? { bytes: st.size, mtimeMs: st.mtimeMs } : null;
    } catch (err) {
      if (code(err) === 'ENOENT') return null;
      throw err;
    }
  }
}

/** Flush a directory entry after a rename (POSIX); Windows cannot open directories. */
async function syncDir(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    const h = await open(dir, 'r');
    try {
      await h.sync();
    } finally {
      await h.close();
    }
  } catch {
    // Best effort: some file systems refuse to fsync a directory.
  }
}

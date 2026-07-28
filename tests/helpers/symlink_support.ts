import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function supportsFileSymlinks(): boolean {
  const root = mkdtempSync(join(tmpdir(), 'woc-file-symlink-probe-'));
  const target = join(root, 'target.txt');
  const link = join(root, 'link.txt');
  try {
    writeFileSync(target, 'probe');
    symlinkSync(target, link, 'file');
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') return false;
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

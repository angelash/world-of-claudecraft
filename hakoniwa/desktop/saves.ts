// The desktop file saves (docs/50_tech/release_engineering.md 5.2 to 5.4, 2.7): the save
// container over node:fs in `<userData>/saves`, behind hk:save.*. Every operation is tracked
// so the shell can hold the exit until a save in progress has committed (2.7: at most 10
// seconds). The renderer never touches these files; it sends save requests over the channels.

import type {
  Recoverable,
  SaveBackend,
  SaveReadResult,
  SaveWriteResult,
  SlotRecord,
} from '../src/core/save/backend';
import { ContainerBackend, type ContainerOptions } from '../src/core/save/container';
import { NodeFsStorage } from '../src/core/save/fs_storage';

/** How long the exit waits for a save in progress (2.7). */
export const EXIT_SAVE_WAIT_MS = 10_000;

export interface DesktopSaves {
  readonly backend: SaveBackend;
  /** Resolves once no save operation is in progress. */
  idle(): Promise<void>;
}

/** A SaveBackend whose every call is counted until it settles. */
export function trackSaves(inner: SaveBackend): DesktopSaves {
  const running = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => {
    running.add(p);
    const done = () => running.delete(p);
    p.then(done, done);
    return p;
  };
  return {
    backend: {
      list: (): Promise<SlotRecord[]> => track(inner.list()),
      write: (req): Promise<SaveWriteResult> => track(inner.write(req)),
      read: (req): Promise<SaveReadResult> => track(inner.read(req)),
      delete: (req): Promise<void> => track(inner.delete(req)),
      recoverables: (): Promise<Recoverable[]> => track(inner.recoverables()),
      restore: (req): Promise<SaveWriteResult> => track(inner.restore(req)),
    },
    async idle() {
      while (running.size > 0) {
        await Promise.allSettled([...running]);
      }
    },
  };
}

/** The container over `savesDir` (5.2), with this machine as the writer. */
export function openDesktopSaves(savesDir: string, opts: ContainerOptions): DesktopSaves {
  return trackSaves(new ContainerBackend(new NodeFsStorage(savesDir), opts));
}

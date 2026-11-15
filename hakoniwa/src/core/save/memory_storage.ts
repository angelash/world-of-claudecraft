// In-memory SaveStorage for tests and for browsers without IndexedDB. It can simulate a
// power cut (release_engineering.md 10.4): after a chosen number of mutating operations
// the next one is torn (a write keeps only its first half, a rename or delete does not
// happen) and every later call fails until powerOn() "reboots" the machine.

import { assertSafePath, type SaveStorage, type StoredStat } from './storage';

interface Entry {
  data: Uint8Array;
  mtimeMs: number;
}

export class PowerCut extends Error {
  constructor() {
    super('power cut');
    this.name = 'PowerCut';
  }
}

export type StorageOp = 'write' | 'rename' | 'remove';

export class MemoryStorage implements SaveStorage {
  private readonly files = new Map<string, Entry>();
  private readonly now: () => number;
  /** Mutating operations since the last powerOn (or construction). */
  ops = 0;
  /** Every mutating operation, in order, for tests that check the write order. */
  readonly journal: { op: StorageOp; path: string; to?: string }[] = [];
  private cutAt = Number.POSITIVE_INFINITY;
  private dead = false;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => 0);
  }

  /** Cut the power during the n-th mutating operation from now (1-based). */
  cutPowerAt(n: number): void {
    this.cutAt = this.ops + n;
  }

  /** Reboot after a cut: the storage works again with whatever reached it. */
  powerOn(): void {
    this.dead = false;
    this.cutAt = Number.POSITIVE_INFINITY;
  }

  get powered(): boolean {
    return !this.dead;
  }

  private alive(): void {
    if (this.dead) throw new PowerCut();
  }

  /** Count a mutating operation; true when this one is the torn one. */
  private mutate(op: StorageOp, path: string, to?: string): boolean {
    this.alive();
    this.ops++;
    this.journal.push(to === undefined ? { op, path } : { op, path, to });
    if (this.ops >= this.cutAt) {
      this.dead = true;
      return true;
    }
    return false;
  }

  async read(path: string): Promise<Uint8Array | null> {
    assertSafePath(path);
    this.alive();
    const e = this.files.get(path);
    return e ? e.data.slice() : null;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    assertSafePath(path);
    if (this.mutate('write', path)) {
      this.files.set(path, { data: data.slice(0, data.length >> 1), mtimeMs: this.now() });
      throw new PowerCut();
    }
    this.files.set(path, { data: data.slice(), mtimeMs: this.now() });
  }

  async rename(from: string, to: string): Promise<void> {
    assertSafePath(from);
    assertSafePath(to);
    if (this.mutate('rename', from, to)) throw new PowerCut();
    const e = this.files.get(from);
    if (!e) throw new Error(`rename: no such file ${from}`);
    this.files.delete(from);
    this.files.set(to, e);
  }

  async remove(path: string): Promise<void> {
    assertSafePath(path);
    if (this.mutate('remove', path)) throw new PowerCut();
    this.files.delete(path);
  }

  async list(dir: string): Promise<string[]> {
    this.alive();
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  async stat(path: string): Promise<StoredStat | null> {
    this.alive();
    const e = this.files.get(path);
    return e ? { bytes: e.data.length, mtimeMs: e.mtimeMs } : null;
  }

  // -------------------------------------------------------------------------
  // Test helpers (not part of SaveStorage)

  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  peek(path: string): Uint8Array | undefined {
    return this.files.get(path)?.data;
  }

  /** Overwrite raw bytes (corruption and cloud-sync tests). */
  poke(path: string, data: Uint8Array, mtimeMs = this.now()): void {
    this.files.set(path, { data: data.slice(), mtimeMs });
  }

  drop(path: string): void {
    this.files.delete(path);
  }

  totalBytes(): number {
    let n = 0;
    for (const e of this.files.values()) n += e.data.length;
    return n;
  }
}

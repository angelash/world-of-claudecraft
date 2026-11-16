// The five version numbers of a save (release_engineering.md 5.5) against this build:
// `container`, `worldVersion` and `renameVersion` are integers, `gameVersion` is semantic
// (compared when both sides parse as major.minor.patch), and `contentVersion` is a hash
// that only identifies the data (it has no order and never refuses a save). A save with
// any ordered version above this build's is refused for reading, and its slot is never
// overwritten (5.5 forward incompatibility).

import { WORLD_VERSION } from '../world';
import { CONTAINER_VERSION, type SlotHeaderDraft } from './header';
import { RENAME_VERSION } from './renames';

/** This build's ordered version numbers (gameVersion only when the host knows it). */
export interface BuildVersions {
  container: number;
  worldVersion: number;
  renameVersion: number;
  gameVersion?: string;
}

export function buildVersions(gameVersion?: string): BuildVersions {
  const v: BuildVersions = {
    container: CONTAINER_VERSION,
    worldVersion: WORLD_VERSION,
    renameVersion: RENAME_VERSION,
  };
  if (gameVersion !== undefined) v.gameVersion = gameVersion;
  return v;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * -1, 0 or 1 by semantic version precedence (major, minor, patch, then a pre-release below
 * its release, pre-release identifiers numeric before text); build metadata is ignored.
 * Null when either side is not a version.
 */
export function compareGameVersions(a: string, b: string): -1 | 0 | 1 | null {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(x[i]) - Number(y[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  const px = x[4];
  const py = y[4];
  if (px === undefined || py === undefined) {
    if (px === py) return 0;
    return px === undefined ? 1 : -1;
  }
  const ix = px.split('.');
  const iy = py.split('.');
  for (let i = 0; i < Math.max(ix.length, iy.length); i++) {
    const p = ix[i];
    const q = iy[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export type VersionField = 'container' | 'worldVersion' | 'renameVersion' | 'gameVersion';

/**
 * The raw version numbers of a header's text are above this build's, whatever else the
 * text holds (a newer build's header this build cannot parse is still never replaced).
 */
export function newerText(text: string, build: BuildVersions = buildVersions()): boolean {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof v !== 'object' || v === null) return false;
  const h = v as Record<string, unknown>;
  const int = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) ? x : 0);
  return (
    int(h.container) > build.container ||
    int(h.worldVersion) > build.worldVersion ||
    int(h.renameVersion) > build.renameVersion ||
    (build.gameVersion !== undefined &&
      typeof h.gameVersion === 'string' &&
      compareGameVersions(h.gameVersion, build.gameVersion) === 1)
  );
}

/** The version fields of a header above this build's; empty when this build can read it. */
export function newerFields(
  h: Pick<SlotHeaderDraft, 'container' | 'worldVersion' | 'renameVersion' | 'gameVersion'>,
  build: BuildVersions = buildVersions(),
): VersionField[] {
  const out: VersionField[] = [];
  if (h.container > build.container) out.push('container');
  if (h.worldVersion > build.worldVersion) out.push('worldVersion');
  if (h.renameVersion > build.renameVersion) out.push('renameVersion');
  if (
    build.gameVersion !== undefined &&
    compareGameVersions(h.gameVersion, build.gameVersion) === 1
  ) {
    out.push('gameVersion');
  }
  return out;
}

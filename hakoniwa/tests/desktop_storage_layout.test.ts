// The desktop storage layout (docs/50_tech/release_engineering.md 5.2, 5.3, 2.5, 12.1, 13.10)
// that the file save backend (PK-M0-16) and the settings store (PK-M0-20) build on: the fixed
// user data directory name, every path under it, and the id and file name rules that keep
// a renderer-supplied id from naming anything outside its directory.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BAD_SUFFIX,
  isRunId,
  isSha256,
  isSlotId,
  parseSaveFileName,
  SETTINGS_PARTS,
  SLOT_IDS,
  saveFileName,
  storageLayout,
  TMP_SUFFIX,
  USER_DATA_DIR_NAME,
  userDataDir,
} from '../desktop/paths';

const ROOT = join('/data', USER_DATA_DIR_NAME);
const SHA = '0123456789abcdef'.repeat(4);

describe('user data directory', () => {
  it('has a fixed name independent of display name and language', () => {
    expect(USER_DATA_DIR_NAME).toBe('HakoniwaChronicle');
    expect(userDataDir(join('/x', 'AppData', 'Roaming'))).toBe(
      join('/x', 'AppData', 'Roaming', 'HakoniwaChronicle'),
    );
  });
});

describe('storage layout', () => {
  const l = storageLayout(ROOT);
  const rel = (p: string) =>
    p
      .slice(ROOT.length + 1)
      .split(/[\\/]/)
      .join('/');

  it('places settings, secrets, ledger, flags and logs as 5.2 lists them', () => {
    expect(rel(l.settingsSync)).toBe('settings.sync.json');
    expect(rel(l.settingsLocal)).toBe('settings.local.json');
    expect(SETTINGS_PARTS).toEqual(['sync', 'local']);
    expect(l.settings('sync')).toBe(l.settingsSync);
    expect(l.settings('local')).toBe(l.settingsLocal);
    expect(rel(l.secrets)).toBe('secrets.bin');
    expect(rel(l.ledger)).toBe('llm/ledger.jsonl');
    expect(rel(l.flags)).toBe('flags.jsonl');
    expect(rel(l.mainLog)).toBe('logs/main.log');
    expect(rel(l.rendererLog)).toBe('logs/renderer.log');
  });

  it('places saves as content-addressed run files and slot headers', () => {
    expect(rel(l.snapshot('r-6c1f0a9e', SHA))).toBe(`saves/runs/r-6c1f0a9e/snap/${SHA}.hks`);
    expect(rel(l.segment('r-6c1f0a9e', SHA))).toBe(`saves/runs/r-6c1f0a9e/seg/${SHA}.hkg`);
    expect(rel(l.snapshotDir('r-6c1f0a9e'))).toBe('saves/runs/r-6c1f0a9e/snap');
    expect(rel(l.segmentDir('r-6c1f0a9e'))).toBe('saves/runs/r-6c1f0a9e/seg');
    expect(rel(l.slotHeader('manual_07'))).toBe('saves/slots/manual_07.json');
    expect(rel(l.slotHeaderPrev('manual_07'))).toBe('saves/slots/manual_07.prev.json');
    expect(rel(l.thumb('quick'))).toBe('saves/thumbs/quick.png');
    expect(rel(l.trashDir)).toBe('saves/trash');
    expect(l.dirs.map(rel)).toEqual([
      '',
      'llm',
      'logs',
      'saves',
      'saves/runs',
      'saves/slots',
      'saves/thumbs',
      'saves/trash',
    ]);
    expect(TMP_SUFFIX).toBe('.tmp');
    expect(BAD_SUFFIX).toBe('.bad');
  });

  it('refuses ids that could name anything else', () => {
    for (const bad of ['../quick', 'manual_21', 'manual_7', 'auto_4', 'Quick', 'quick.json', '']) {
      expect(() => l.slotHeader(bad), bad).toThrow();
      expect(() => l.thumb(bad), bad).toThrow();
    }
    for (const bad of ['r-XYZ', '../r-0123abcd', 'r-0123', 'r-0123abcd/..', 'run-0123abcd']) {
      expect(() => l.runDir(bad), bad).toThrow();
    }
    expect(() => l.snapshot('r-0123abcd', SHA.toUpperCase())).toThrow();
    expect(() => l.segment('r-0123abcd', `${SHA}0`)).toThrow();
  });
});

describe('ids and file names', () => {
  it('pins the slot ids of 5.1', () => {
    expect(SLOT_IDS.length).toBe(25);
    expect(SLOT_IDS.slice(0, 4)).toEqual(['quick', 'auto_1', 'auto_2', 'auto_3']);
    expect(SLOT_IDS.at(4)).toBe('manual_01');
    expect(SLOT_IDS.at(23)).toBe('manual_20');
    expect(SLOT_IDS.at(-1)).toBe('ironman');
    for (const id of SLOT_IDS) expect(isSlotId(id)).toBe(true);
    expect(isSlotId('manual_00')).toBe(false);
    expect(isSlotId(7)).toBe(false);
  });

  it('checks run ids and hashes', () => {
    expect(isRunId('r-6c1f0a9e')).toBe(true);
    expect(isRunId(`r-${'a'.repeat(32)}`)).toBe(true);
    expect(isRunId(`r-${'a'.repeat(33)}`)).toBe(false);
    expect(isRunId('r-6C1F0A9E')).toBe(false);
    expect(isSha256(SHA)).toBe(true);
    expect(isSha256(SHA.slice(1))).toBe(false);
  });

  it('builds and parses content-addressed file names', () => {
    expect(saveFileName(SHA, 'snapshot')).toBe(`${SHA}.hks`);
    expect(saveFileName(SHA, 'segment')).toBe(`${SHA}.hkg`);
    expect(parseSaveFileName(`${SHA}.hks`)).toEqual({ sha256: SHA, kind: 'snapshot' });
    expect(parseSaveFileName(`${SHA}.hkg`)).toEqual({ sha256: SHA, kind: 'segment' });
    for (const bad of [`${SHA}.tmp`, `${SHA}.hks.tmp`, `../${SHA}.hks`, `${SHA}.HKS`, 'x.hks', 5]) {
      expect(parseSaveFileName(bad), String(bad)).toBeNull();
    }
    expect(() => saveFileName('nothex', 'snapshot')).toThrow();
  });
});

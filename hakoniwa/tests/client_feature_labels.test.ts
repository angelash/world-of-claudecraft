// Every gameplay feature that content can unlock must have a player-facing label, so the
// log never shows a raw id such as "door_corridor" (found in a browser play-test). The labels
// are the ui.common.feature.* keys of locales/zh-Hans/ui.json.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCE_TABLE } from '../src/shared_ui/i18n';

const DATA = join(__dirname, '..', 'data');

function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (p.endsWith('.json')) out.push(p);
  }
  return out;
}

function unlockableFeatures(): Set<string> {
  const found = new Set<string>();
  for (const file of jsonFiles(DATA)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/"feature"\s*:\s*"([a-z_]+)"/g)) found.add(m[1] as string);
    for (const m of text.matchAll(/"feature\.([a-z_]+)"/g)) found.add(m[1] as string);
  }
  return found;
}

describe('feature labels', () => {
  it('labels every feature that content can unlock', () => {
    const missing = [...unlockableFeatures()].filter(
      (f) => !SOURCE_TABLE[`ui.common.feature.${f}`],
    );
    expect(missing).toEqual([]);
  });
});

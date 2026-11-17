// Generate data/doors/rank_curve.json, the door-rank thresholds of thousand_doors.md 4.3:
// entry r - 1 is the least rank-value sum P with 2 * P^0.75 >= r (16 * P^3 >= r^4 in
// integers), for ranks 1 to 99. The kernel reads the file and never takes a float power;
// the content validator (src/content/packs/doors.ts, 21.6 rule 8) compares it entry by
// entry with the same formula.
//
//   node tools/doors/rank_curve.ts           write the file
//   node tools/doors/rank_curve.ts --check   fail when the file is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Rank = typeof import('../../src/systems/doors/rank');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'doors', 'rank_curve.json');

async function main(): Promise<number> {
  // Node strips the types of this file; the rank module loads by file URL (explicit .ts).
  const rank = (await import(
    new URL('../../src/systems/doors/rank.ts', import.meta.url).href
  )) as Rank;
  const body = {
    about:
      'Door rank thresholds (thousand_doors.md 4.3), written by tools/doors/rank_curve.ts: entry r - 1 is the least sum of door rank values P with 16 * P^3 >= r^4, that is rank = max(1, floor(2 * P^0.75)), for ranks 1 to 99. Do not edit by hand.',
    thresholds: rank.rankCurve(),
  };
  const text = `${JSON.stringify(body, null, 2).replace(/\[\n\s+([\d,\s]+?)\n\s+\]/, (_m, list: string) => `[${list.replace(/\s+/g, ' ').trim()}]`)}\n`;
  if (process.argv.includes('--check')) {
    // the shipped file is formatted by biome: compare the thresholds, not the layout
    let cur: unknown = null;
    try {
      cur = JSON.parse(readFileSync(OUT, 'utf8'));
    } catch {
      cur = null;
    }
    const got = (cur as { thresholds?: unknown } | null)?.thresholds;
    if (JSON.stringify(got) !== JSON.stringify(body.thresholds)) {
      console.error('data/doors/rank_curve.json is stale: run node tools/doors/rank_curve.ts');
      return 1;
    }
    console.log('data/doors/rank_curve.json is current');
    return 0;
  }
  writeFileSync(OUT, text);
  console.log(`wrote data/doors/rank_curve.json (${body.thresholds.length} ranks)`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});

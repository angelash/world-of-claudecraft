// Compares two text-golden digests (tests/playthrough/text_golden.playthrough.test.ts):
// the autoplayer result, the rendered event stream (whole, per kind, per window), the world
// checkpoints at every act change and the final world (per slice, metadata, AI state, flags).
//   node tools/i18n/golden_diff.ts <before.json> <after.json>
// Prints one line per difference and exits 1 when there is any; the run time is ignored.

import { readFileSync } from 'node:fs';

type Json = Record<string, unknown>;

function load(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffGolden(a: Json, b: Json): string[] {
  const out: string[] = [];
  const ra = a.result as Json;
  const rb = b.result as Json;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (!same(ra[k], rb[k]))
      out.push(`result.${k}: ${JSON.stringify(ra[k])} != ${JSON.stringify(rb[k])}`);
  }
  const ea = a.events as Json;
  const eb = b.events as Json;
  if (ea.count !== eb.count) out.push(`events.count: ${ea.count} != ${eb.count}`);
  if (ea.hash !== eb.hash) out.push(`events.hash: ${ea.hash} != ${eb.hash}`);
  const ka = ea.byKind as Record<string, { count: number; hash: string }>;
  const kb = eb.byKind as Record<string, { count: number; hash: string }>;
  for (const k of [...new Set([...Object.keys(ka), ...Object.keys(kb)])].sort()) {
    if (!same(ka[k], kb[k]))
      out.push(`events.byKind.${k}: ${JSON.stringify(ka[k])} != ${JSON.stringify(kb[k])}`);
  }
  const wa = ea.windows as [number, number, string][];
  const wb = eb.windows as [number, number, string][];
  const firstWindow = wa.findIndex((w, i) => !same(w, wb[i]));
  if (firstWindow >= 0 || wa.length !== wb.length) {
    const i = firstWindow >= 0 ? firstWindow : Math.min(wa.length, wb.length);
    out.push(
      `events.windows: first difference at window ${i} (from tick ${wa[i]?.[0] ?? wb[i]?.[0]})`,
    );
  }
  const ca = a.checkpoints as Json[];
  const cb = b.checkpoints as Json[];
  if (ca.length !== cb.length) out.push(`checkpoints: ${ca.length} != ${cb.length}`);
  const world = (label: string, x: Json | undefined, y: Json | undefined) => {
    if (!x || !y) return;
    for (const k of ['tick', 'act', 'meta', 'ai']) {
      if (!same(x[k], y[k]))
        out.push(`${label}.${k}: ${JSON.stringify(x[k])} != ${JSON.stringify(y[k])}`);
    }
    const sx = x.slices as Record<string, string>;
    const sy = y.slices as Record<string, string>;
    for (const k of [...new Set([...Object.keys(sx), ...Object.keys(sy)])].sort()) {
      if (sx[k] !== sy[k]) out.push(`${label}.slices.${k}: ${sx[k]} != ${sy[k]}`);
    }
  };
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) world(`checkpoint[${i}]`, ca[i], cb[i]);
  world('final', a.final as Json, b.final as Json);
  const fa = (a.final as Json).flags as Json;
  const fb = (b.final as Json).flags as Json;
  for (const k of [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()) {
    if (!same(fa[k], fb[k]))
      out.push(`final.flags.${k}: ${JSON.stringify(fa[k])} != ${JSON.stringify(fb[k])}`);
  }
  return out;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/i18n/golden_diff.ts');
if (isMain) {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) {
    process.stderr.write('usage: node tools/i18n/golden_diff.ts <before.json> <after.json>\n');
    process.exit(2);
  }
  const diffs = diffGolden(load(before), load(after));
  for (const d of diffs) process.stdout.write(`${d}\n`);
  process.stdout.write(
    diffs.length ? `${diffs.length} difference(s)\n` : 'identical (text rendered)\n',
  );
  process.exitCode = diffs.length ? 1 : 0;
}

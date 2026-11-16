// Text-key golden capture (PK-M0-14, release_engineering.md 8.4 step 5): plays one ending
// route with the autoplayer on the no-model build and writes a digest of the run. Every
// TextRef in events, slices and metadata is first rendered to its source-language string
// with the locale tables (src/shared_ui/i18n.ts, when present), so a run before the
// migration and a run after it digest the same unless something other than the text
// moved. Compare two digests with tools/i18n/golden_diff.ts.
//
// Skipped unless TEXT_GOLDEN_OUT names the output file; TEXT_GOLDEN_ROUTE picks the route
// (default release). Example, from hakoniwa/:
//   TEXT_GOLDEN_OUT=out.json TEXT_GOLDEN_ROUTE=rule_merca \
//     npx vitest run --config vitest.playthrough.config.ts tests/playthrough/text_golden
// TEXT_GOLDEN_DUMP=<from>-<to> also writes the rendered events of that tick range as JSON
// lines next to the output file, to find the first differing event of a window.
// TEXT_GOLDEN_MAX_TICKS caps the run (default 6000000), so a route stuck on work in
// progress elsewhere in the tree still ends with a digest two trees compare on.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnyWorldEvent } from '../../src/core/contracts';
import { Autoplayer, type EndingRoute } from '../../src/game/autoplay';
import { createGame } from '../../src/game/create';
import { SEED } from './harness';

const OUT = process.env.TEXT_GOLDEN_OUT;
const ROUTE = (process.env.TEXT_GOLDEN_ROUTE ?? 'release') as EndingRoute;
const DUMP = process.env.TEXT_GOLDEN_DUMP;
const MAX_TICKS = Number(process.env.TEXT_GOLDEN_MAX_TICKS) || 6_000_000;
/** event digest window, in ticks */
const WINDOW = 20000;

type Render = (value: unknown) => unknown;

interface TextModule {
  isTextRef(v: unknown): boolean;
  t(ref: unknown): string;
  setContentText?(lookup: unknown): void;
  contentTextLookup?(content: unknown): unknown;
}

/** The deep renderer: TextRefs to strings with the locale tables; identity before them. */
async function loadRender(content: unknown): Promise<Render> {
  const mods = import.meta.glob<TextModule>('../../src/shared_ui/i18n.ts');
  const load = Object.values(mods)[0];
  if (!load) return (v) => v;
  const m = await load();
  if (m.setContentText && m.contentTextLookup) m.setContentText(m.contentTextLookup(content));
  const render: Render = (v) => {
    if (Array.isArray(v)) return v.map(render);
    if (v && typeof v === 'object') {
      if (m.isTextRef(v)) return m.t(v);
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = render(x);
      return out;
    }
    return v;
  };
  return render;
}

/** JSON with sorted object keys, so field order never shows up as a difference. */
function canonical(v: unknown): string {
  if (Array.isArray(v))
    return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

describe.skipIf(!OUT)('text golden capture', () => {
  it(`captures the ${ROUTE} route`, async () => {
    const t0 = performance.now();
    const engine = createGame({ seed: SEED, aiMode: 'off', logLimit: 10_000_000 });
    const render = await loadRender(engine.content);
    const all = createHash('sha256');
    let count = 0;
    const byKind = new Map<string, { count: number; hash: ReturnType<typeof createHash> }>();
    const windows: [number, number, string][] = [];
    let win = { from: 0, count: 0, hash: createHash('sha256') };
    const closeWindow = () => {
      if (win.count > 0) windows.push([win.from, win.count, win.hash.digest('hex').slice(0, 16)]);
    };
    const dumpRange = DUMP ? DUMP.split('-').map(Number) : null;
    const dumped: string[] = [];
    const checkpoints: unknown[] = [];
    const digestWorld = () => {
      const w = engine.world;
      const slices: Record<string, string> = {};
      for (const [k, v] of Object.entries(w.slices)) slices[k] = sha(canonical(render(v)));
      return {
        tick: w.meta.tick,
        act: w.meta.flags.act,
        slices,
        meta: sha(canonical(render(w.meta))),
        ai: sha(canonical(render(w.ai))),
      };
    };
    engine.onEvents((events: readonly AnyWorldEvent[]) => {
      let actChanged = false;
      for (const ev of events) {
        const start = Math.floor(ev.tick / WINDOW) * WINDOW;
        if (start !== win.from) {
          closeWindow();
          win = { from: start, count: 0, hash: createHash('sha256') };
        }
        const line = canonical(render(ev));
        all.update(line);
        all.update('\n');
        win.hash.update(line);
        win.count++;
        count++;
        let k = byKind.get(ev.kind);
        if (!k) {
          k = { count: 0, hash: createHash('sha256') };
          byKind.set(ev.kind, k);
        }
        k.count++;
        k.hash.update(line);
        if (dumpRange && ev.tick >= (dumpRange[0] ?? 0) && ev.tick <= (dumpRange[1] ?? 0))
          dumped.push(line);
        if (ev.kind === 'act.changed') actChanged = true;
      }
      if (actChanged) checkpoints.push(digestWorld());
    });
    const bot = new Autoplayer(engine, { route: ROUTE, log: () => {} });
    const result = bot.run({ maxTicks: MAX_TICKS });
    closeWindow();
    const w = engine.world;
    const report = {
      route: ROUTE,
      seed: SEED,
      result: {
        ending: result.ending,
        finished: result.finished,
        stuck: result.stuck ?? null,
        ticks: result.ticks,
        deaths: result.deaths,
        questsDone: result.questsDone,
        acts: result.acts,
        commands: result.commands,
      },
      events: {
        count,
        hash: all.digest('hex').slice(0, 16),
        byKind: Object.fromEntries(
          [...byKind.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, { count: v.count, hash: v.hash.digest('hex').slice(0, 16) }]),
        ),
        windows,
      },
      checkpoints,
      final: {
        ...digestWorld(),
        flags: JSON.parse(canonical(render(w.meta.flags))),
      },
      ms: Math.round(performance.now() - t0),
    };
    writeFileSync(OUT as string, `${JSON.stringify(report, null, 1)}\n`);
    if (DUMP) writeFileSync(`${OUT}.events.jsonl`, `${dumped.join('\n')}\n`);
    expect(count).toBeGreaterThan(0);
  });
});

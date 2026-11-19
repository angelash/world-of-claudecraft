// The onboarding check's command (run through Vite by ./check.ts): reads the catalogue, the
// variable registry, the event kinds the kernel declares (every `interface EventMap` block
// under src/, the core one and each system's augmentation) and the source string tables, then
// prints the findings of src/client/tutorial/check.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_COUNTS, TUT_STEPS } from '../../src/client/tutorial/catalog';
import {
  checkGlossary,
  checkTutorial,
  checkTutText,
  waitingSteps,
} from '../../src/client/tutorial/check';
import { glossaryFlags, glossaryKeys } from '../../src/client/tutorial/glossary';
import { defaultRegistry } from '../../src/core/registry/default';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** The top-level keys of every `interface EventMap { ... }` block in a source text. */
export function eventKindsIn(text: string): string[] {
  const out: string[] = [];
  let i = text.indexOf('interface EventMap');
  while (i >= 0) {
    const open = text.indexOf('{', i);
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    let d = 0;
    for (const line of text.slice(open, end).split('\n')) {
      const m = /^\s*'([a-z_][a-z0-9_.]*)'\s*:/.exec(line);
      if (m && d === 1) out.push(m[1] as string);
      for (const c of line) {
        if (c === '{') d++;
        else if (c === '}') d--;
      }
    }
    i = text.indexOf('interface EventMap', end);
  }
  return out;
}

function eventKinds(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(join(ROOT, 'src'))) {
    for (const k of eventKindsIn(readFileSync(f, 'utf8'))) out.add(k);
  }
  return out;
}

/** The source string tables merged (the generated content table left out). */
function sourceTable(): Record<string, string> {
  const dir = join(ROOT, 'locales', 'zh-Hans');
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f.endsWith('.generated.json') || f.startsWith('_')) continue;
    Object.assign(out, JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
  return out;
}

export async function main(argv: string[]): Promise<number> {
  const registry = defaultRegistry();
  const kinds = eventKinds();
  const table = sourceTable();
  const keys = new Set(Object.keys(table));
  const isRegistered = (f: string) => registry.isRegistered(f);
  const waiting = waitingSteps(TUT_STEPS);
  const findings = [
    ...checkTutorial({
      steps: TUT_STEPS,
      isRegistered,
      eventKinds: kinds,
      textKeys: keys,
      counts: DESIGN_COUNTS,
    }),
    ...checkGlossary({
      flags: glossaryFlags(),
      keys: glossaryKeys(),
      isRegistered,
      textKeys: keys,
    }),
    ...checkTutText(table),
  ];
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ steps: TUT_STEPS.length, findings, waiting }, null, 1));
  } else {
    for (const f of findings) console.log(`${f.code}  ${f.step}  ${f.detail}`);
    // reported, not failed: these steps fire or end once their package delivers the signal
    for (const w of waiting)
      console.log(`waiting  ${w.step}  ${w.where}: ${w.packages.join(', ')}`);
    console.log(
      `onboarding check: ${findings.length} finding(s), ${waiting.length} waiting; ${TUT_STEPS.length} steps, ${kinds.size} event kinds`,
    );
  }
  return findings.length === 0 ? 0 : 1;
}

// Guards the layering rules of docs/50_tech/architecture.md 2 and 12:
// - pure logic layers (core, content, systems, ai, game) never touch the DOM;
// - simulation layers (core, systems, game) never use non-deterministic time or randomness.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PURE = ['core', 'content', 'systems', 'ai', 'game'];
const SIM = ['core', 'systems', 'game'];
const DOM =
  /\b(document|window|HTMLElement|HTMLCanvasElement|localStorage|requestAnimationFrame)\b/;
const NONDETERMINISTIC = /\b(Math\.random|Date\.now|performance\.now|new Date\()/;

describe('architecture guard', () => {
  for (const layer of PURE) {
    it(`${layer}/ has no DOM access`, () => {
      const dir = join(SRC, layer);
      const bad = files(dir).filter((f) => DOM.test(stripComments(readFileSync(f, 'utf8'))));
      expect(bad).toEqual([]);
    });
  }
  for (const layer of SIM) {
    it(`${layer}/ has no non-deterministic time or randomness`, () => {
      const dir = join(SRC, layer);
      const bad = files(dir).filter((f) =>
        NONDETERMINISTIC.test(stripComments(readFileSync(f, 'utf8'))),
      );
      expect(bad).toEqual([]);
    });
  }
});

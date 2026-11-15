// Guards the layering rules of docs/50_tech/architecture.md 2 and 12:
// - pure logic layers (core, content, systems, ai, game) never touch the DOM;
// - simulation layers (core, systems, game) never use non-deterministic time or randomness;
// - only the world system writes the entity fields alive, tags, speed, move and intent;
//   every other system goes through src/systems/world/ports.ts (release_engineering.md 13.1);
// - core, systems, game and ai never import src/platform, which never imports the client.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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

// ---------------------------------------------------------------------------
// Entity field ownership (release_engineering.md 13.1): outside src/systems/world/, no
// system assigns or mutates the entity fields below; it calls the world ports
// (setLife, setTagValue, setTag, haltEntity, setMoveSpeed) instead.

const SYSTEMS = join(SRC, 'systems');
const OWNED = 'alive|tags|speed|move|intent';
const NAME = String.raw`[A-Za-z_$][\w$]*`;
const CHAIN = String.raw`${NAME}(?:\s*\.\s*${NAME}|\s*\[[^\]\n]*\])*`;
/** `.alive` or `['alive']`, not `.aliveCount`. */
const FIELD = String.raw`(?:\.\s*(?:${OWNED})(?![\w$])|\[\s*['"\`](?:${OWNED})['"\`]\s*\])`;
/** Plain or compound assignment; never a comparison or an arrow. */
const ASSIGN = String.raw`(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])?=(?![=>])`;
const TAGS_MUTATORS = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';

/** Write forms; capture group 1 always ends right after the written field. */
const WRITE_FORMS: RegExp[] = [
  // e.alive = false; e.speed *= k; e.tags ??= []; e['move'] = null
  new RegExp(String.raw`(${FIELD})\s*${ASSIGN}`, 'g'),
  // e.speed++; e.speed--
  new RegExp(String.raw`(${FIELD})\s*(?:\+\+|--)`, 'g'),
  // ++e.speed; delete e.move
  new RegExp(String.raw`((?:\+\+|--|\bdelete\s)\s*${CHAIN}?\s*${FIELD})`, 'g'),
  // e.tags.push(t); e.tags[i] = t
  new RegExp(
    String.raw`(\.\s*tags)\s*(?:\.\s*(?:${TAGS_MUTATORS})\s*\(|\[[^\]\n]*\]\s*${ASSIGN})`,
    'g',
  ),
  // e.move.goal = g; e.intent.dx = 1
  new RegExp(String.raw`(\.\s*(?:move|intent))\s*\.\s*${CHAIN}\s*${ASSIGN}`, 'g'),
];
const TARGET = new RegExp(`(${CHAIN})$`);

interface FieldWrite {
  /** the written member chain without spaces, e.g. `e.alive` or `st.alive` */
  target: string;
  /** the source line holding the write */
  line: string;
}

function fieldWrites(code: string): FieldWrite[] {
  const seen = new Map<number, FieldWrite>();
  for (const form of WRITE_FORMS) {
    for (const m of code.matchAll(form)) {
      const end = (m.index ?? 0) + (m[1] ?? '').length;
      if (seen.has(end)) continue;
      const head = code.slice(Math.max(0, end - 200), end);
      const target = (TARGET.exec(head)?.[1] ?? head.trim()).replace(/\s+/g, '');
      const from = code.lastIndexOf('\n', end - 1) + 1;
      const to = code.indexOf('\n', end);
      seen.set(end, { target, line: code.slice(from, to < 0 ? undefined : to).trim() });
    }
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w);
}

/**
 * Writes to same-named fields of records that are not entities, by file under
 * src/systems/. Each entry must still match a write (checked below).
 */
const NOT_ENTITY: Record<string, string[]> = {
  // SpawnState.alive: the ids of the live units of a spawn point
  'combat/spawning.ts': ['st.alive'],
  // Nation.alive: a strategy-layer nation still in the game
  'strategy/military.ts': ['loser.alive'],
};

function systemFiles(): { rel: string; code: string }[] {
  return files(SYSTEMS).map((f) => ({
    rel: relative(SYSTEMS, f).replace(/\\/g, '/'),
    code: stripComments(readFileSync(f, 'utf8')),
  }));
}

describe('entity field ownership guard', () => {
  it('no system outside world/ writes alive, tags, speed, move or intent', () => {
    const bad: string[] = [];
    for (const { rel, code } of systemFiles()) {
      if (rel.startsWith('world/')) continue;
      const allowed = NOT_ENTITY[rel] ?? [];
      for (const w of fieldWrites(code)) {
        if (!allowed.includes(w.target)) bad.push(`${rel}: ${w.line}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every non-entity exemption still names a live write', () => {
    for (const [rel, targets] of Object.entries(NOT_ENTITY)) {
      const code = stripComments(readFileSync(join(SYSTEMS, rel), 'utf8'));
      const found = fieldWrites(code).map((w) => w.target);
      for (const t of targets) expect(found, `${rel} ${t}`).toContain(t);
    }
  });

  it('the world ports are the writers the guard leaves to world/', () => {
    const ports = stripComments(readFileSync(join(SYSTEMS, 'world', 'ports.ts'), 'utf8'));
    expect(fieldWrites(ports).map((w) => w.target)).toEqual([
      'e.alive',
      'e.move',
      'e.intent',
      'e.tags',
      'e.tags',
      'e.tags',
      'e.move',
      'e.intent',
      'e.speed',
    ]);
    expect(existsSync(join(SYSTEMS, 'combat', 'entity_ops.ts'))).toBe(false);
  });

  it('the scanner catches every write form and ignores reads', () => {
    const writes = [
      'e.alive = false;',
      'e.speed *= 0.5;',
      'e.tags ??= [];',
      "e['move'] = null;",
      'slice.units[id].intent = null;',
      'e.speed++;',
      '--e.speed;',
      'delete e.move;',
      "e.tags.push('x');",
      'e.tags.sort();',
      "e.tags[0] = 'x';",
      'e.move.goal = g;',
      'e.intent.dx = 1;',
      'getEntity(w, id)!.alive = true;',
    ];
    expect(fieldWrites(writes.join('\n')).map((w) => w.target)).toEqual([
      'e.alive',
      'e.speed',
      'e.tags',
      "e['move']",
      'slice.units[id].intent',
      'e.speed',
      'e.speed',
      'e.move',
      'e.tags',
      'e.tags',
      'e.tags',
      'e.move',
      'e.intent',
      'alive',
    ]);
    const reads = [
      'if (e.alive === false) return;',
      'if (e.move) stop();',
      'const ok = e.speed >= 0 && e.speed <= 9 && e.speed != 1;',
      "const next = [...e.tags, 'x'];",
      "const has = e.tags.includes('x');",
      'const sorted = e.tags.slice().sort();',
      'const idle = e.move == null && e.intent !== null;',
      'x.aliveCount = 1;',
      'd.speedMult = 2;',
      'const pick = (x: Entity) => x.intent;',
      'const alive = true;',
      'const spec = { alive: true, tags: [] };',
    ];
    expect(fieldWrites(reads.join('\n'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The platform layer (release_engineering.md 2.2, architecture.md 2): only src/client/
// uses src/platform/. Core, systems, game and ai never import it, and it never imports
// the client.

const IMPORT_FROM = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"\n]+)['"]/g;

/** Relative module specifiers of every import, export-from and dynamic import. */
function relativeImports(code: string): string[] {
  return [...code.matchAll(IMPORT_FROM)]
    .map((m) => m[1] as string)
    .filter((spec) => spec.startsWith('.'));
}

function isUnder(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Files under `layer` with an import that resolves into `target`, as `file -> spec`. */
function importsInto(layer: string, target: string): string[] {
  const bad: string[] = [];
  for (const f of files(join(SRC, layer))) {
    for (const spec of relativeImports(stripComments(readFileSync(f, 'utf8')))) {
      if (isUnder(resolve(dirname(f), spec), join(SRC, target))) {
        bad.push(`${relative(SRC, f).replace(/\\/g, '/')} -> ${spec}`);
      }
    }
  }
  return bad;
}

describe('platform layer guard', () => {
  for (const layer of ['core', 'systems', 'game', 'ai']) {
    it(`${layer}/ never imports src/platform`, () => {
      expect(importsInto(layer, 'platform')).toEqual([]);
    });
  }

  it('platform/ never imports src/client', () => {
    expect(files(join(SRC, 'platform')).length).toBeGreaterThan(0);
    expect(importsInto('platform', 'client')).toEqual([]);
  });

  it('the scanner sees every import form', () => {
    const code = [
      "import { a } from '../platform/host';",
      "import type { B } from '../../platform';",
      "export * from '../platform/web_host';",
      "import '../platform/side_effect';",
      "const m = await import('../platform/select');",
      "import { c } from 'vitest';",
    ].join('\n');
    expect(relativeImports(code)).toEqual([
      '../platform/host',
      '../../platform',
      '../platform/web_host',
      '../platform/side_effect',
      '../platform/select',
    ]);
    const at = join(SRC, 'core', 'x.ts');
    expect(isUnder(resolve(dirname(at), '../platform'), join(SRC, 'platform'))).toBe(true);
    expect(isUnder(resolve(dirname(at), '../platform/host'), join(SRC, 'platform'))).toBe(true);
    expect(isUnder(resolve(dirname(at), '../platform_x'), join(SRC, 'platform'))).toBe(false);
  });
});

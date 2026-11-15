// Guards for the editor workbench (src/editor/):
// - every module outside the DOM allowlist is pure (no DOM), so it runs under Vitest;
// - the workbench reads the systems' public index.ts surface and the AI layer, but never
//   the game client (src/client) and never a system's internal module;
// - user-visible Chinese text lives in src/editor/text.ts only;
// - no forbidden characters in any editor file.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const EDITOR = join(ROOT, 'src', 'editor');

/** Modules allowed to touch the DOM. Every other editor module must stay pure. */
const DOM_MODULES = [
  'main.ts',
  'shell/dom.ts',
  'shell/tool.ts',
  'shell/shell_ui.ts',
  'content/content_ui.ts',
  'map/map_ui.ts',
  'map/map_canvas.ts',
  'inspector/inspector_ui.ts',
  'inspector/ai_controls.ts',
  'checks/checks_ui.ts',
  'checks/target_links.ts',
  'roles/roles_panel.ts',
  'audit/audit_ui.ts',
  'ledger/ledger_ui.ts',
  'quests/quest_graph_ui.ts',
  'balance/balance_ui.ts',
];

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(p)) out.push(p);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (p: string) => relative(EDITOR, p).replace(/\\/g, '/');
const sources = files(EDITOR, /\.ts$/);
const DOM =
  /\b(document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|localStorage|sessionStorage|requestAnimationFrame|navigator)\b/;

describe('editor architecture', () => {
  it('lists only DOM modules that exist', () => {
    const present = new Set(sources.map(rel));
    expect(DOM_MODULES.filter((m) => !present.has(m))).toEqual([]);
  });

  it('keeps every non-DOM module free of DOM access', () => {
    const bad = sources
      .filter((f) => !DOM_MODULES.includes(rel(f)))
      .filter((f) => DOM.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel);
    expect(bad).toEqual([]);
  });

  it('imports systems only through their public surface, and never the client', () => {
    // A system's public surface is its index.ts (and types.ts for type-only imports);
    // world/grid.ts is the one kernel-owned pure helper the map tools reuse directly.
    const publicFile = /\/systems\/[^/']+(\/(index|types))?$|\/systems\/world\/grid$/;
    const bad: string[] = [];
    for (const f of sources) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
        const spec = m[1] as string;
        if (spec.includes('/systems/') && !publicFile.test(spec)) bad.push(`${rel(f)} -> ${spec}`);
        if (/(^|\/)client(\/|$)/.test(spec.replace(/^(\.\.\/)+/, ''))) {
          bad.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps Chinese UI text in text.ts', () => {
    const CJK = new RegExp(`[${String.fromCodePoint(0x4e00)}-${String.fromCodePoint(0x9fff)}]`);
    const bad = sources
      .filter((f) => rel(f) !== 'text.ts')
      .filter((f) => CJK.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel);
    expect(bad).toEqual([]);
  });

  it('has no forbidden characters in editor sources, styles, page and tests', () => {
    const forbidden = new RegExp(
      `[${[0x2013, 0x2014, 0x2015, 0xfe0f].map((c) => String.fromCodePoint(c)).join('')}${String.fromCodePoint(0x2600)}-${String.fromCodePoint(0x27bf)}]|[${String.fromCodePoint(0x1f000)}-${String.fromCodePoint(0x1faff)}]`,
      'u',
    );
    const all = [
      ...files(EDITOR, /\.(ts|css)$/),
      join(ROOT, 'editor.html'),
      ...files(join(ROOT, 'tests'), /editor[^/\\]*\.test\.ts$/),
    ];
    const bad = all
      .filter((f) => existsSync(f) && forbidden.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});

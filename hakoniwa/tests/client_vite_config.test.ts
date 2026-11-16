import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInputs } from '../vite.config';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('client vite config', () => {
  it('always builds the game page and adds the editor only when editor.html exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hk-vite-'));
    dirs.push(dir);
    expect(buildInputs(dir)).toEqual({ main: resolve(dir, 'index.html') });
    writeFileSync(join(dir, 'editor.html'), '<!doctype html>');
    expect(buildInputs(dir)).toEqual({
      main: resolve(dir, 'index.html'),
      editor: resolve(dir, 'editor.html'),
    });
    // The desktop (release) target never builds the editor (tests/release_bundle.test.ts).
    expect(buildInputs(dir, 'desktop')).toEqual({ main: resolve(dir, 'index.html') });
  });
});

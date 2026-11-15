// build:bundle used to run its sitemap, SFX manifest, and media manifest
// pregen steps serially, even though each reads and writes its own disjoint
// set of files. scripts/build_bundle_pregen.mjs runs them concurrently via
// Promise.all instead. These teeth pin: the step list itself (so a step
// silently dropping from build:bundle fails loudly), that a step's real
// output surfaces through runPregenStep, that a failing step rejects with
// its exit code and stderr, and that runPregen genuinely overlaps the steps
// before any one step can finish, rather than awaiting each one serially.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PREGEN_STEPS, runPregen, runPregenStep } from '../scripts/build_bundle_pregen.mjs';

describe('PREGEN_STEPS', () => {
  it('runs exactly the sitemap, SFX manifest, and media manifest generate steps', () => {
    expect(PREGEN_STEPS).toEqual([
      ['scripts/build_sitemap.mjs'],
      ['scripts/build_sfx_manifest.mjs'],
      ['scripts/build_media_manifest.mjs', 'generate'],
    ]);
  });
});

describe('runPregenStep', () => {
  it('resolves with the captured stdout of a successful step', async () => {
    const { stdout } = await runPregenStep(['-e', 'console.log("pregen-step-ok")']);
    expect(stdout).toContain('pregen-step-ok');
  });

  it('rejects with the exit code and stderr when a step fails', async () => {
    await expect(
      runPregenStep(['-e', 'console.error("pregen-step-broke"); process.exit(3)']),
    ).rejects.toThrow(/exited with code 3[\s\S]*pregen-step-broke/);
  });

  it('rejects when the child process fails to spawn at all', async () => {
    await expect(runPregenStep(['-e', 'console.log(1)'], '/no/such/node/binary')).rejects.toThrow(
      /failed to spawn/,
    );
  });
});

describe('runPregen', () => {
  it(
    'runs every step concurrently rather than one after another',
    async () => {
      // Every real child must arrive before any can exit. A serial runner
      // cannot release the first child, regardless of process startup cost.
      const root = mkdtempSync(join(tmpdir(), 'woc-pregen-overlap-'));
      const script = join(root, 'barrier.mjs');
      try {
        writeFileSync(
          script,
          `import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [root, id] = process.argv.slice(2);
writeFileSync(join(root, id + '.ready'), 'ready');
const deadline = setTimeout(() => {
  console.error('pregen peers did not start concurrently');
  process.exit(7);
}, 20000);
const poll = setInterval(() => {
  if (![0, 1, 2].every(peer => existsSync(join(root, peer + '.ready')))) return;
  clearTimeout(deadline);
  clearInterval(poll);
}, 10);
`,
        );
        await runPregen([0, 1, 2].map((id) => [script, root, String(id)]));
        expect(
          readdirSync(root)
            .filter((name) => name.endsWith('.ready'))
            .sort(),
        ).toEqual(['0.ready', '1.ready', '2.ready']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    process.platform === 'win32' ? 120_000 : 30_000,
  );

  it('surfaces every step output in step order once all succeed', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await runPregen([
        ['-e', 'console.log("first")'],
        ['-e', 'console.log("second")'],
      ]);
      const written = writeSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(written.indexOf('first')).toBeLessThan(written.indexOf('second'));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('rejects with a non-zero-exit failure when any one step fails', async () => {
    await expect(
      runPregen([
        ['-e', 'setTimeout(() => process.exit(0), 200)'],
        ['-e', 'process.exit(9)'],
      ]),
    ).rejects.toThrow(/exited with code 9/);
  });
});

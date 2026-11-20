import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkerHost } from '../tools/service/worker_host';

describe('managed Vite configuration changes', () => {
  it('does not automatically restart on configuration edits outside the Web countdown', async () => {
    const base = join(__dirname, '../.local/service_setup');
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, 'watch-fixture-'));
    mkdirSync(join(root, 'tools/service'), { recursive: true });
    copyFileSync(
      join(__dirname, '../tools/service/worker.ts'),
      join(root, 'tools/service/worker.ts'),
    );
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>fixture</title>');
    writeFileSync(
      join(root, 'vite.config.ts'),
      `import { appendFileSync } from 'node:fs';
export default { plugins: [{name:'boot-evidence',configureServer(){appendFileSync(${JSON.stringify(join(root, 'boots.txt'))},'boot\\n')}}] };`,
    );
    const worker = new WorkerHost(root, join(root, 'state'), () => {});
    try {
      await worker.start();
      const port = worker.port;
      expect(readFileSync(join(root, 'boots.txt'), 'utf8')).toBe('boot\n');
      appendFileSync(join(root, 'vite.config.ts'), '\n// phase edit: explicit restart required\n');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(readFileSync(join(root, 'boots.txt'), 'utf8')).toBe('boot\n');
      expect(worker.port).toBe(port);
    } finally {
      await worker.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

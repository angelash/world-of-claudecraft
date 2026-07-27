import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../scripts/active_ai_online_smoke.mjs', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

describe('active AI online smoke registration contract', () => {
  it('supplies the recovery email required by the current register route', () => {
    expect(source).toMatch(/const email = `\$\{username\}@example\.com`;/);
    expect(source).toMatch(
      /api\('\/api\/register', \{\n\s+method: 'POST',\n\s+body: JSON\.stringify\(\{ username, password, email \}\),/,
    );
  });
});

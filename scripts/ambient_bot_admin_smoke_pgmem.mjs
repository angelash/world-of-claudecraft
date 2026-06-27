#!/usr/bin/env node
import process from 'node:process';

console.error(
  'scripts/ambient_bot_admin_smoke_pgmem.mjs has been retired. Ambient bot admin smoke must run against the persistent Postgres-backed realm.',
);
console.error('Use `npm run db:up`, then `node scripts/online_lan.mjs server --restart`, then run `node scripts/ambient_bot_admin_smoke.mjs` with AMBIENT_ADMIN_USER and AMBIENT_ADMIN_PASS set.');
process.exit(1);

#!/usr/bin/env node
import process from 'node:process';

console.error(
  'scripts/ambient_bot_server_pgmem.mjs has been retired. Ambient bot live checks must use the persistent Postgres-backed realm.',
);
console.error('Start native PostgreSQL with `npm run db:up`, then boot the realm with `node scripts/online_lan.mjs server --restart`.');
process.exit(1);

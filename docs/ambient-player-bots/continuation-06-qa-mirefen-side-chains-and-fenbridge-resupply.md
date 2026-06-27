# Continuation 06 QA: Mirefen Side Chains And Fenbridge Resupply

Goal: audit the widow and drowned route ladder plus the Fenbridge-local sustain
change before moving on to the next Mirefen quest band.

## Audit checklist

- verify north-zone vendor selection stays local to Mirefen and does not break
  the earlier Eastbrook vendor path
- verify the widow route remains reconstructible without hidden state even
  though the same mob advances both kill and drop objectives
- verify drowned-chapel object routing still uses real target and interact flow
- verify focused ambient-bot suites, `build:server`, and the persistent Postgres smoke
  stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Stop conditions

- stop and fix before continuation close if the widow or drowned ladder needs
  non-snapshot progression memory
- stop and fix before continuation close if Fenbridge vendor selection causes
  Eastbrook restock or junk-vendor regressions

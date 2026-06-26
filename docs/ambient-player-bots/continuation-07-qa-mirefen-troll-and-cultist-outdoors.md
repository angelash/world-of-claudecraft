# Continuation 07 QA: Mirefen Troll And Cultist Outdoors

Goal: audit the Broodmother, troll, Grubjaw, and first cult-camp outdoor ladder
before moving on to the cult summoner and Bastion approach gap.

## Audit checklist

- verify `q_broodmother` changes phase at the right quest-count boundary and
  does not cling to stale widow routing
- verify the outdoor route order stays natural, especially that the Broodmother
  comes before the drowned chain successor routes and that Grubjaw resolves
  before the cult-camp pickup
- verify focused ambient-bot suites, `build:server`, and the local pg-mem smoke
  stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Stop conditions

- stop and fix before continuation close if the Broodmother handoff needs
  non-snapshot progression memory
- stop and fix before continuation close if the new outdoor route order causes
  bots to skip earlier Mirefen follow-ups

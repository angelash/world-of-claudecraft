# Continuation 03 QA: Mixed-Source Collection Progression

Goal: audit multi-source quest routing before moving on to supply and longer-run
autonomy gaps.

## Audit checklist

- verify route-level sub-objective gating only activates when the underlying
  quest objective is still incomplete
- verify duplicate routes for one quest do not break accept or turn-in flow
- verify bots hand off from the first `q_rite` source to the second without
  clinging to stale path state
- verify focused ambient-bot suites and `build:server` stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before continuation close if mixed-source routing depends on
  non-snapshot progression memory
- stop and fix before continuation close if duplicate quest routes break the
  real NPC quest acceptance order

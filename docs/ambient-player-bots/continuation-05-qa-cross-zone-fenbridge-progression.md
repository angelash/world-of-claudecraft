# Continuation 05 QA: Cross-Zone Fenbridge Progression

Goal: audit the first cross-zone progression ladder before moving on to the
deeper Mirefen route graph.

## Audit checklist

- verify distinct turn-in NPC support only changes routes that opt into it
- verify the Fenbridge handoff still works through real movement, object
  interaction, and NPC turn-in flow
- verify new Zone 2 routes remain data-driven and reconstructible from live
  snapshot quest counts
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

- stop and fix before continuation close if the Fenbridge handoff needs hidden
  progression state beyond live snapshot data
- stop and fix before continuation close if distinct turn-in NPC support breaks
  the existing Eastbrook or chapel route ladder

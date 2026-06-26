# Phase 14 QA: Verify Phase 13 Admin, Telemetry, and Incident Controls

Goal: audit the new operator control plane before moving on to live readiness
and smoke automation.

## Audit checklist

- verify `/admin/api/ambient-bots` reports planner, runtime, and LLM state
  together
- verify live planner config updates change diagnostics and planner behavior as
  expected
- verify paused login or provisioning controls suppress new ambient actions
  without breaking planner visibility
- verify logout-all resets active ambient bot runners without touching normal
  player sessions
- verify LLM diagnostics track cache, budget, and last-decision state
- remove stale or misleading Phase 13 test assumptions if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 15 if operator control changes can affect a real
  player session
- stop and fix before Phase 15 if paused runtime controls still open new
  ambient bot sessions
- stop and fix before Phase 15 if the new admin or diagnostics code introduces
  type-check failures outside the existing repo baseline

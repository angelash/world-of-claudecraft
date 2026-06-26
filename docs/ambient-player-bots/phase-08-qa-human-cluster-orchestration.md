# Phase 8 QA: Verify Phase 7 Human-Cluster Orchestration

Goal: audit the first full human-cluster orchestration slice before moving on to
social shells and player-facing bot identity memory.

## Audit checklist

- verify cluster continuity keeps pending capacity from duplicating when nearby
  human membership changes
- verify a drifting online bot can hand off to a better nearby cluster without a
  logout or relog churn loop
- verify overflow load-shedding logs out only the extra bots and keeps the best
  local matches assigned
- verify no bot can be released and then immediately reattached to the same
  cluster in the same planner cycle
- remove dead branches or stale planner assumptions if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 9 if cluster membership churn can still duplicate
  pending provision slots
- stop and fix before Phase 9 if a released bot can immediately reattach to the
  same cluster it just left
- stop and fix before Phase 9 if solo or shared clusters can stay permanently
  over target after nearby humans leave

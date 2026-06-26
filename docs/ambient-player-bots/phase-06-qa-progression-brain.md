# Phase 6 QA: Verify Phase 5 Progression Brain

Goal: audit the first real progression slice before moving on to human-cluster
handoff and broader ambient lifecycle behavior.

## Audit checklist

- verify the Phase 5 starter flow really covers accept, hunt, loot, and turn-in
- verify the runtime now ticks connected bots without adding a sim-only path
- verify the brain tests cover:
  - starter quest pickup near Marshal Redbrook
  - travel toward wolf camps when the quest is active
  - ranged or class-appropriate combat commands when a target is in range
  - vendor sell-all-junk behavior after the starter quest
  - stuck reset behavior
- verify the runtime integration test proves a connected bot emits gameplay
  commands after login
- remove dead branches or debug-only state if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 7 if a bot can stall forever with held movement
- stop and fix before Phase 7 if the progression brain needs a privileged sim
  shortcut instead of real command traffic
- stop and fix before Phase 7 if reconnecting a bot loses enough live state to
  break pathing or ability choice

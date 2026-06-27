# Continuation 11 QA: Highwatch Handoff And Thornpeak Starters

Goal: verify that the first Thornpeak Heights progression slice stays
data-driven, local to Highwatch, and free of regressions in the real ambient
bot runtime.

## Audit checklist

- confirm the Highwatch handoff uses the normal Brother Aldric to world-object
  to Captain Thessaly quest flow
- confirm the ridge stalker and kobold starter pairs overlap in the intended
  order, without early turn-in drift
- confirm Thornpeak bots restock from Quartermaster Bree and stay on a local
  fallback grind path when the next quest gate is level-bound
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in the Highwatch handoff, starter quest
  overlap, or local vendor path
- focused validation is green
- packet notes clearly name the next Thornpeak gap after the starter ladder

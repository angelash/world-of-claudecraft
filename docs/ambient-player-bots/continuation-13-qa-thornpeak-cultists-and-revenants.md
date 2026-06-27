# Continuation 13 QA: Thornpeak Cultists And Revenants

Goal: verify that the late-Thornpeak solo outdoor progression slice stays
data-driven, bounded to valid cultist and revenant sources, and free of
regressions in the real ambient bot runtime.

## Audit checklist

- confirm the Wyrmcult chain keeps the intended order across `q_zealots`,
  `q_cult_orders`, and `q_necromancers`
- confirm the mixed kill or collect cult routes stay bounded to the intended
  zealot and necromancer sources
- confirm the revenant fields chain keeps the intended order across
  `q_revenants` and `q_revenant_vanguard`
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in the cultist, mixed-objective, or revenant
  outdoor paths
- focused validation is green
- packet notes clearly name the next Thornpeak gap after the late outdoor solo
  ladders

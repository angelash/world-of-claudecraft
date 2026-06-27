# Continuation 14 QA: Thornpeak Sanctum Approach

Goal: verify that the Sanctum-approach outdoor prep slice stays data-driven,
bounded to valid object and kill sources, and free of regressions in the real
ambient bot runtime.

## Audit checklist

- confirm the Sanctum-approach chain keeps the intended order across
  `q_wyrm_sigils`, `q_breaking_the_seal`, `q_voice_below`, and `q_sanctum_gate`
- confirm the mixed `q_voice_below` kill routes stay bounded to the intended
  zealot and necromancer sources
- confirm the sigil and gate-key object routes stay bounded to the intended
  ground-object sources
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in the sigil, ember, congregation, or gate
  prep paths
- focused validation is green
- packet notes clearly name the next Thornpeak gap after the Sanctum-approach
  prep ladder

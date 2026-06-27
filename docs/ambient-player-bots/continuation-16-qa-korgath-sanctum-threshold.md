# Continuation 16 QA: Korgath Sanctum Threshold

Goal: verify that the first Gravewyrm Sanctum bridge stays bounded to the live
quest and dungeon flow, preserves the earlier Bastion and outdoor grouped
behavior, and keeps the Korgath slice free of regressions.

## Audit checklist

- confirm the grouped Thornpeak order keeps `q_korgath` after the Drogmar
  bridge and does not skip straight to later Sanctum boss content
- confirm the Sanctum bridge uses the normal live party, dungeon-entry,
  in-instance routing, and dungeon-exit paths only
- confirm the Korgath route stays bounded to the intended Gravewyrm Sanctum
  boss spawn and does not regress earlier Bastion or outdoor grouped behavior
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in Korgath accept, party assembly, Sanctum
  entry, boss routing, or dungeon exit behavior
- focused validation is green
- packet notes clearly name the next deeper Sanctum gap after Korgath

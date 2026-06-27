# Continuation 17 QA: Velkhar Sanctum Bridge

Goal: verify that the second Gravewyrm Sanctum bridge stays bounded to the
live quest and dungeon flow, preserves the earlier Bastion, outdoor grouped,
and Korgath behavior, and keeps the Velkhar slice free of regressions.

## Audit checklist

- confirm the grouped Thornpeak order keeps `q_velkhar` after the Korgath
  bridge and does not skip straight to later Sanctum boss content
- confirm the Sanctum bridge uses the normal live party, dungeon-entry,
  in-instance routing, and dungeon-exit paths only
- confirm the Velkhar route stays bounded to the intended Gravewyrm Sanctum
  boss spawn and does not regress earlier Bastion, outdoor grouped, or Korgath
  behavior
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in Velkhar accept, party assembly, Sanctum
  re-entry, boss routing, or dungeon exit behavior
- focused validation is green
- packet notes clearly name the final Sanctum gap after Velkhar

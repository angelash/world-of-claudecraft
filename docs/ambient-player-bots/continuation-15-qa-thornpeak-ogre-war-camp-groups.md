# Continuation 15 QA: Thornpeak Ogre War-Camp Groups

Goal: verify that grouped outdoor objective coordination stays bounded to the
same live quest flow, preserves the existing Bastion dungeon logic, and keeps
the Thornpeak ogre war-camp slice free of regressions.

## Audit checklist

- confirm outdoor grouped coordination matches same-cluster ambient bots on the
  same grouped quest instead of broad same-cluster outdoor objectives
- confirm the grouped Thornpeak order keeps `q_crushers` ahead of `q_drogmar`
  and does not skip straight to later solo chains
- confirm outdoor invite, accept, regroup, and follower reattachment stay on
  the normal live party and chat command path
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in outdoor grouped invite, accept, regroup, or
  war-camp routing behavior
- focused validation is green
- packet notes clearly name the next grouped Thornpeak gap after Drogmar

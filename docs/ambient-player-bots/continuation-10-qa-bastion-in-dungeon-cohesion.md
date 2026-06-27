# Continuation 10 QA: Bastion In-Dungeon Cohesion

Goal: verify that the Bastion in-dungeon cohesion slice keeps grouped ambient
bots together without introducing new command-path regressions.

## Audit checklist

- confirm followers only use the normal `/follow <leader>` chat path
- confirm leader regroup holds suppress forward progress when Bastion party
  members are split
- confirm existing Bastion entry, Olen-first routing, Vael follow-up, and
  dungeon exit behavior still pass
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in the regroup and follow path
- focused validation is green
- packet notes clearly name the next open gap after Bastion cohesion

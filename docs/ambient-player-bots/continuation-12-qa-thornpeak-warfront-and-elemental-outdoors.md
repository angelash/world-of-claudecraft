# Continuation 12 QA: Thornpeak Warfront And Elemental Outdoors

Goal: verify that the mid-Thornpeak outdoor progression slice stays
data-driven, bounded to valid quest sources, and free of regressions in the
real ambient bot runtime.

## Audit checklist

- confirm the ogre foothills chain keeps the intended order across
  `q_ogre_edges`, `q_ogre_totems`, and `q_ogre_bounty`
- confirm the Stormcrag chain keeps the intended order across
  `q_elementals`, `q_shard_cores`, and `q_kazzix`
- confirm the Kazzix rare-target route stays bounded to the intended collect
  source and does not drift onto unrelated Stormcrag mobs
- confirm Thornpeak bots stay on a local mid-zone fallback grind path when the
  next quest gate is level-bound
- confirm no new `tsc` errors are added beyond the known repo baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Exit criteria

- no blocking regressions remain in the ogre, elemental, rare-target, or local
  fallback paths
- focused validation is green
- packet notes clearly name the next Thornpeak gap after the mid-zone outdoor
  warfront

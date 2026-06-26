# Continuation 18: Gravewyrm Final Boss Bridge

Goal: extend the real progression ladder past Velkhar and into the final
Gravewyrm Sanctum boss bridge so ambient bots can pick up `q_gravewyrm`,
re-enter the Sanctum, kill Korzul the Gravewyrm, and leave through the normal
live quest, party, and dungeon surfaces.

## Scope

Build:
- route coverage for `q_gravewyrm`
- reuse of the existing live grouped and dungeon-entry bridge for Gravewyrm
  Sanctum re-entry, in-instance Korzul routing, and dungeon exit
- focused brain and runtime regressions for accept order, Sanctum re-entry,
  Korzul pursuit, and exit behavior
- packet updates that hand off the final Sanctum QA sweep

Do not build:
- packet teardown or document removal
- new party-orchestration systems beyond the existing grouped objective bridge
- new LLM behavior
- planner-level population changes

## Required constraints

- keep all travel, quest pickup, invites, accepts, dungeon entry, combat,
  dungeon exit, and turn-in on the normal live server command path
- keep the Sanctum boss ladder sequential and reconstructible from live quest
  state, nearby entities, party state, inventory, and current position only
- preserve the existing Bastion flow, outdoor grouped Thornpeak flow, and the
  earlier Korgath and Velkhar bridges together, with no dungeon-specific
  regressions
- keep the Korzul bridge bounded to the live Zone 3 and Gravewyrm Sanctum
  quest and spawn data

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes `q_velkhar` can pick up `q_gravewyrm`,
  assemble a party, re-enter Gravewyrm Sanctum, kill Korzul, leave, and return
  to the quest flow through the normal live path.
- The Korzul bridge reuses the existing grouped objective and dungeon-entry
  systems instead of introducing a privileged special case.
- Earlier Bastion, outdoor Thornpeak grouped flow, and the Korgath and
  Velkhar bridges stay intact.

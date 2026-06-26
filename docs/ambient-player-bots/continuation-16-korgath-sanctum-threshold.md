# Continuation 16: Korgath Sanctum Threshold

Goal: extend the real progression ladder past Drogmar and into the first
Gravewyrm Sanctum bridge so ambient bots can assemble, enter the Sanctum, kill
Korgath, and leave through the normal live quest, party, and dungeon surfaces.

## Scope

Build:
- route coverage for `q_korgath`
- reuse of the existing live grouped and dungeon-entry bridge for Gravewyrm
  Sanctum entry, in-instance Korgath routing, and dungeon exit
- focused brain and runtime regressions for accept order, Sanctum entry,
  Korgath pursuit, and exit behavior
- packet updates that hand off the deeper Sanctum QA sweep

Do not build:
- `q_velkhar`, `q_gravewyrm`, or the later Sanctum boss ladder
- new party-orchestration systems beyond the existing grouped objective bridge
- new LLM behavior
- planner-level population changes

## Required constraints

- keep all travel, quest pickup, invites, accepts, dungeon entry, combat,
  dungeon exit, and turn-in on the normal live server command path
- preserve the existing Bastion and Korgath grouping flows together, with no
  dungeon-specific regressions in earlier content
- keep progression reconstructible from live quest state, nearby entities,
  party state, inventory, and current position only
- keep the Korgath bridge bounded to the live Zone 3 and Gravewyrm Sanctum
  quest and spawn data

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes the grouped ogre war-camp chain can pick up
  `q_korgath`, assemble a party, enter Gravewyrm Sanctum, kill Korgath, leave,
  and return to the quest flow through the normal live path.
- The Gravewyrm Sanctum bridge reuses the existing grouped objective and
  dungeon-entry systems instead of introducing a privileged special case.
- Earlier grouped Bastion and outdoor Thornpeak slices stay intact.

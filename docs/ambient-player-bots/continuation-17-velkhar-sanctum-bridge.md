# Continuation 17: Velkhar Sanctum Bridge

Goal: extend the real progression ladder past Korgath and into the second
Gravewyrm Sanctum boss bridge so ambient bots can pick up `q_velkhar`,
re-enter the Sanctum, kill Velkhar, and leave through the normal live quest,
party, and dungeon surfaces.

## Scope

Build:
- route coverage for `q_velkhar`
- reuse of the existing live grouped and dungeon-entry bridge for Gravewyrm
  Sanctum re-entry, in-instance Velkhar routing, and dungeon exit
- focused brain and runtime regressions for accept order, Sanctum re-entry,
  Velkhar pursuit, and exit behavior
- packet updates that hand off the deeper Sanctum QA sweep

Do not build:
- `q_gravewyrm` or the final Sanctum boss ladder
- new party-orchestration systems beyond the existing grouped objective bridge
- new LLM behavior
- planner-level population changes

## Required constraints

- keep all travel, quest pickup, invites, accepts, dungeon entry, combat,
  dungeon exit, and turn-in on the normal live server command path
- keep the Sanctum boss ladder sequential and reconstructible from live quest
  state, nearby entities, party state, inventory, and current position only
- preserve the existing Bastion flow, outdoor grouped Thornpeak flow, and the
  earlier Korgath bridge together, with no dungeon-specific regressions
- keep the Velkhar bridge bounded to the live Zone 3 and Gravewyrm Sanctum
  quest and spawn data

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes `q_korgath` can pick up `q_velkhar`, assemble
  a party, re-enter Gravewyrm Sanctum, kill Velkhar, leave, and return to the
  quest flow through the normal live path.
- The Velkhar bridge reuses the existing grouped objective and dungeon-entry
  systems instead of introducing a privileged special case.
- Earlier Bastion, outdoor Thornpeak grouped flow, and the Korgath bridge stay
  intact.

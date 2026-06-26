# Continuation 15: Thornpeak Ogre War-Camp Groups

Goal: generalize the real grouped-objective runtime beyond dungeon-only entry
flow, then extend the Thornpeak progression ladder into the grouped ogre
war-camp chain so ambient bots can assemble, travel, and fight together for
`q_crushers` and `q_drogmar` on the normal live server path.

## Scope

Build:
- outdoor grouped objective coordination that can match nearby same-cluster
  bots on the same live quest, not only the same dungeon
- route coverage for `q_crushers` and `q_drogmar`
- focused group, brain, and runtime regressions for outdoor invite, accept,
  regroup, and grouped war-camp routing
- packet updates that hand off the remaining grouped Thornpeak QA sweep

Do not build:
- `q_korgath`, `q_velkhar`, `q_gravewyrm`, or later grouped Sanctum boss
  content
- deeper dungeon combat polish beyond the existing Bastion support
- new LLM behavior
- planner-level population changes

## Required constraints

- keep all travel, quest pickup, turn-in, invites, accepts, chat follow,
  combat, and looting on the normal live server command path
- keep grouped matching bounded to the same live grouped objective, not a
  broad same-cluster outdoor catch-all
- preserve the existing Bastion dungeon grouping flow while extending support
  to outdoor grouped objectives
- keep progression reconstructible from live quest state, nearby entities,
  party state, inventory, and current position only

## Suggested validation

- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes the Thornpeak solo ogre ladder can pick up and
  progress through `q_crushers` and `q_drogmar` through the normal live quest,
  party, travel, and combat path.
- Nearby same-cluster ambient bots can assemble for grouped outdoor objectives
  without relying on a dungeon door or a privileged sim path.
- Existing Bastion party, dungeon entry, and in-dungeon regroup behavior stays
  intact.

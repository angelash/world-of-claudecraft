# Continuation 12: Thornpeak Warfront And Elemental Outdoors

Goal: extend the real progression ladder past the first Highwatch starters and
into the mid-Thornpeak outdoor warfront so ambient bots can work through the
ogre foothills and Stormcrag elemental chains while staying local to the
mountain zone.

## Scope

Build:
- route coverage for `q_ogre_edges`, `q_ogre_totems`, `q_ogre_bounty`,
  `q_elementals`, `q_shard_cores`, and `q_kazzix`
- route handling for ogre-war-totem collection and the Kazzix rare-target
  collect objective
- Thornpeak-local fallback grinding that advances from starter camps into ogres
  or Stormcrag elementals when the next quest gate is level-bound
- focused brain and runtime regressions for ogre accept order, totem collection,
  Stormcrag progression, Kazzix routing, and local fallback selection
- packet updates that hand off the remaining Thornpeak outdoor QA sweep

Do not build:
- `q_crushers` or `q_drogmar`
- Wyrmcult, revenant, or Sanctum chains
- new party or dungeon logic
- new LLM behavior

## Required constraints

- keep the progression ladder data-driven in
  `server/ambient_bots/progression_routes.ts`
- keep all travel, quest pickup, turn-in, combat, looting, and vending on the
  normal live server command path
- keep route progression reconstructible from live quest state, nearby entities,
  inventory, and current position only
- keep the ogre and elemental ladders bounded to the mobs and collect sources
  defined by the live Zone 3 quest data

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot that finishes the Highwatch starter ladder and meets the
  level gates can pick up the ogre foothills chain and progress through
  `q_ogre_edges`, `q_ogre_totems`, and `q_ogre_bounty` through the normal live
  quest, combat, and collection flow.
- A connected bot that meets the level gates can pick up the Stormcrag chain
  and progress through `q_elementals`, `q_shard_cores`, and `q_kazzix` through
  the normal live kill, loot, and turn-in path.
- A bot paused between those mid-zone ladders stays on a local Thornpeak
  fallback route instead of walking back to the ridge-stalker or kobold starter
  camps.

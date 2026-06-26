# Phase 5: Progression Brain V1

Goal: move ambient bots beyond "can log in" into a real early-game play loop on
the live server, starting with the Eastbrook beginner path and a low-cost grind
fallback that keeps them visibly playing after the first quest.

## Scope

Build:
- a focused `server/ambient_bots/brain.ts` module
- a runtime brain loop that ticks only connected ambient bots
- starter quest flow for `q_wolves`: approach Marshal Redbrook, accept, hunt
  Forest Wolves, loot, and return to turn in
- server-side pathing that uses the live `/ws` hello seed plus shared sim
  pathfinding helpers
- low-risk post-quest grinding for nearby level-appropriate mobs
- basic recovery behavior: do not break eating or drinking, use food or drink
  if available, sell junk at Trader Wilkes, and reset when stuck
- focused brain and runtime tests

Do not build:
- the full multi-zone quest chain
- party, dungeon, or social behavior
- LLM planning or chat
- extra persistence tables for per-tick runner state

## Required constraints

- progression still runs through real WebSocket commands and movement frames
- `src/sim/` remains unchanged and model-free
- bot brain state is reconstructible from live snapshot data after reconnect
- keep DB churn low: update registry memory often, persist only on lifecycle
  edges or existing runtime save points
- keep `server/game.ts` untouched unless a new named seam is truly required

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected bot can path to Marshal Redbrook and pick up `q_wolves`.
- A connected bot can travel to wolf camps, target wolves, fight, and loot.
- A connected bot can return to Marshal Redbrook and turn the quest in.
- After the starter quest, a connected bot keeps playing through junk vendoring
  and low-risk grind targets instead of idling in town.
- The runtime exposes the current brain objective in `runnerState`.
- A stuck travel loop breaks itself within a few seconds instead of holding
  movement forever.

# Phase 3: Real-Server Runner And Provisioning

Goal: turn the Phase 1 planner actions into real server activity by wiring a
runtime that provisions accounts and characters, logs ambient bots in over the
real HTTP and WebSocket surfaces, and syncs lifecycle state back into the bot
registry.

## Scope

Build:
- a small REST client for `/api/register`, `/api/login`, and `/api/characters`
- a small WebSocket client for `/ws` auth, hello, and snapshot delta merge
- bot naming helpers for account and character creation
- a runtime that consumes `provisionBot`, `loginBot`, and `logoutBot` actions
- `GameServer` seams for bot-record lookup, upsert, and action dispatch
- `main.ts` startup and auth wiring so ambient bot sessions are recognized as
  bots on the live server
- focused runtime and ws helper tests

Do not build:
- quest routing
- combat or travel AI
- friend, whisper, or LLM social behavior
- operator UI

## Required constraints

- the runner must use real HTTP and WebSocket surfaces, not sim-only cheats
- keep model logic and runner logic out of `src/sim/`
- keep `server/game.ts` changes thin and named
- persist bot credentials and lifecycle state additively
- treat ambient bot sessions as non-human for planner input

## Suggested validation

- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A `provisionBot` action creates a real account and character row.
- The runtime authenticates a bot over `/ws` and receives real snapshots.
- Ambient bot sessions carry `ambientBotId` through `game.join(...)`.
- Hard per-IP socket limits do not block ambient bots from the server host.
- Unexpected socket close resets the bot lifecycle back to a reusable state.

# Continuation 01 QA: Expanded Solo Progression

Goal: audit the first post-packet progression extension before moving on to
object and collection quest support.

## Audit checklist

- verify the route registry matches real Eastbrook quest ordering and
  prerequisites
- verify accept, active, and ready states resolve correctly across the new solo
  kill routes
- verify unrelated nearby mobs do not steal quest-specific hunt objectives
- verify the focused ambient-bot suites and `build:server` stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before continuation close if a quest-order regression causes bots
  to accept the wrong NPC quest
- stop and fix before continuation close if quest-specific hunting falls back to
  unrelated mobs without an explicit route opt-in

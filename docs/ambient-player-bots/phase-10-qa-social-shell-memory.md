# Phase 10 QA: Verify Phase 9 Social Shell and Bot Identity Memory

Goal: audit the first social interaction slice before moving on to LLM-backed
conversation and planning layers.

## Audit checklist

- verify ambient bot ws handling now ingests `events`, `social`, and
  `socialpos` frames without regressing snapshot handling
- verify incoming whispers create delayed replies, not instant robotic echoes
- verify block-list compliance suppresses replies and friend actions
- verify lightweight relationship memory lands in `social_state`
- verify presence emotes stay bounded by cooldowns instead of spamming nearby
  humans
- remove dead branches or stale shell state if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 11 if social frames can still be dropped silently by
  the ambient bot ws client
- stop and fix before Phase 11 if a blocked player can still trigger a reply or
  a friend add
- stop and fix before Phase 11 if reply timing is immediate and obviously bot-like

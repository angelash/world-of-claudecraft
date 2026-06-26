# Phase 9: Social Shell and Bot Identity Memory

Goal: give connected ambient bots a lightweight social shell that can notice
real player interaction, keep small relationship memory, and answer in a
believable but bounded way without any LLM dependency.

## Scope

Build:
- ws client support for ambient bot `events`, `social`, and `socialpos` frames
- a focused social shell module for incoming whisper handling
- delayed whisper reply scheduling with deterministic timing
- lightweight relationship memory stored in existing bot `social_state`
- basic friend-add shell and presence emotes
- block and ignore compliance based on the live social snapshot
- focused social shell and runtime tests

Do not build:
- LLM-backed dialogue or plan generation
- free-form public chat participation
- new social persistence tables
- admin controls or rollout levers

## Required constraints

- keep the shell behind ambient bot runtime modules, not deep in `server/game.ts`
- use only existing real chat and social commands such as `chat`, `friend_add`,
  and built-in emotes
- keep social memory cheap and infrequent to persist, not a per-tick ledger
- never answer whispers from blocked players or from other ambient bots

## Suggested validation

- `npx vitest run tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected ambient bot can receive social snapshots and event frames from the
  real ws stream.
- A whispered bot schedules a delayed reply instead of answering instantly.
- A whispered bot can issue a bounded friend add and save lightweight contact
  memory in `social_state`.
- Blocked players do not receive a reply and do not trigger friend actions.
- Nearby humans can trigger low-cost presence emotes without chat spam.

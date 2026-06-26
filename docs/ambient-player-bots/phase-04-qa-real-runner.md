# Phase 4 QA: Verify Phase 3 Real Runner

Goal: audit the Phase 3 real runner for correctness, missing tests, and live
session safety before the progression brain starts issuing actual gameplay
commands.

## Audit checklist

- verify Phase 3 deliverables all landed
- verify the runtime tests cover:
  - startup normalization of stale reserved and online rows
  - account and character provisioning
  - real ws auth payloads and snapshot merge
  - unexpected close cleanup
- verify `main.ts` only tags verified bot sessions as ambient bots
- verify planner inputs still exclude ambient bot sessions
- remove dead code and fix naming or lifecycle drift if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 5 if the runner can connect without the real auth
  and character ownership checks
- stop and fix before Phase 5 if an ambient bot disconnect can leave the
  registry stuck in a permanently reserved or online state

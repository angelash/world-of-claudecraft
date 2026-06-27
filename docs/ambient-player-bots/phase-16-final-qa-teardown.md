# Phase 16 QA: Final QA and Teardown Offer

Goal: run the final ambient bot release gate, then offer to remove the planning
packet before a PR is opened.

## Audit checklist

- run the focused ambient bot and admin validation suites
- run the real admin smoke against a reachable persistent realm
- verify pause, restore, and optional logout-all controls work end to end
- confirm the repo-wide TypeScript and build baselines are unchanged except for
  known unrelated failures
- confirm rollout and rollback notes are complete and operator-usable
- decide whether to keep or remove `docs/ambient-player-bots/` before the PR

## Suggested validation

- `node scripts/ambient_bot_admin_smoke.mjs`
- `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before packet close if the real admin smoke cannot restore
  runtime controls after the pause drill
- stop and fix before packet close if final validation adds new errors outside
  the known unrelated repo baseline
- stop and ask before deleting `docs/ambient-player-bots/`

# Phase 12 QA: Verify Phase 11 LLM Social and Plan Integration

Goal: audit the first bounded LLM layer before moving on to operator controls
and rollout tooling.

## Audit checklist

- verify plan and whisper schemas reject malformed or unsafe model output
- verify the runtime still sends heuristic replies when LLM social output is
  rejected, disabled, budget-denied, or errors out
- verify semantic cache keys are not accidentally tied to per-call job ids
- verify audit snapshots stay bounded and include provider, reason, and latency
  detail
- verify the local Codex CLI provider path does not require a new privileged
  gameplay seam
- remove stale or misleading Phase 11 test assumptions if found

## Suggested validation

- `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before Phase 13 if rejected or disabled LLM output can suppress a
  reply instead of falling back to the heuristic shell
- stop and fix before Phase 13 if semantic cache hits can only occur when the
  request timestamp matches exactly
- stop and fix before Phase 13 if the ambient bot LLM path introduces new
  type-check failures outside the existing repo baseline

# Phase 2 QA: Verify Phase 1 Foundation

Goal: audit the Phase 1 ambient bot foundation for correctness, missing tests,
schema safety, and dead code before Phase 3 starts.

## Audit checklist

- verify Phase 1 deliverables all landed
- verify the planner tests cover:
  - solo cluster population
  - shared cluster behavior
  - ready-bot preference
  - far-release behavior
- verify schema strings are additive and wired into `ensureSchema()`
- verify `GameServer` integration remains a thin bridge
- remove dead code and fix naming drift if found

## Suggested validation

- `npx tsc --noEmit`
- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts`
- `npm run build:server`

## Stop conditions

- stop and fix before Phase 3 if the planner cannot distinguish humans from
  future ambient bot sessions
- stop and fix before Phase 3 if the registry schema is not actually boot-wired

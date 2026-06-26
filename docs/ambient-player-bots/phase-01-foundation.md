# Phase 1: Ambient Bot Foundation

Goal: land the server-side foundation for ambient player bots without yet
building the real runner or progression brain.

## Scope

Build:
- ambient bot identity types
- ambient bot config parsing from env
- a pure planner service that:
  - groups nearby humans into shared clusters
  - computes desired nearby population
  - matches existing ready bots to clusters
  - emits bounded `loginBot`, `logoutBot`, and `provisionBot` actions
  - keeps cooldown and reservation hysteresis
- persistent ambient bot registry schema
- a thin `GameServer` integration seam and diagnostics snapshot
- focused tests

Do not build:
- actual HTTP register flow
- actual WebSocket bot runner
- quest execution
- friend or whisper AI
- admin UI

## Required constraints

- keep logic out of `src/sim/`
- keep `server/game.ts` changes thin and named
- additive DDL only
- no placeholder methods that are never exercised
- tests must cover the planner behavior, not just file existence

## Suggested validation

- `npx tsc --noEmit`
- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts`
- `npm run build:server`

## Acceptance criteria

- A solo human cluster produces a target population plan.
- Two nearby humans share one cluster and do not request double population.
- Existing ready bots are preferred over fresh provision requests.
- Far assigned bots are released with cooldown.
- The ambient registry schema is wired into `ensureSchema()`.
- `GameServer` can expose ambient bot diagnostics without touching the sim core.

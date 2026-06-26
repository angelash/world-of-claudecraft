# Phase 13: Admin, Telemetry, and Incident Controls

Goal: give operators a clear control plane for ambient player bots without
adding any privileged gameplay path.

## Scope

Build:
- combined planner, runtime, and LLM diagnostics snapshots for admin API use
- live planner config updates for rollout tuning and observe-only operation
- runtime controls for pausing login, pausing provisioning, and pausing LLM
  overlays without touching the sim
- an emergency logout-all action for active ambient bot runners
- focused operator regressions for admin routes, runtime controls, and LLM
  diagnostics

Do not build:
- admin dashboard UI polish
- new persistence tables
- direct model control over gameplay
- a split worker process or cross-process queue system

## Required constraints

- all gameplay still flows through the real HTTP and WebSocket surfaces
- `src/sim/` stays deterministic and unaware of operator controls
- planner diagnostics must remain available even when the runtime is paused or
  absent
- runtime controls must degrade safely, pause new ambient activity, and never
  bypass moderation or auth checks
- logout-all must only affect ambient bot identities, not real player sessions

## Suggested validation

- `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- `/admin/api/ambient-bots` returns a combined planner, runtime, and LLM
  diagnostics payload.
- Operators can change live planner rollout settings without restarting the
  server process.
- Operators can pause login, provisioning, or LLM overlays without mutating
  authoritative gameplay state directly.
- Operators can force all active ambient bot runners offline through an admin
  incident control.
- Focused tests cover planner config updates, runtime control skips, logout-all,
  and LLM diagnostics snapshots.

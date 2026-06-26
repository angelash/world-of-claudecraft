# Phase 15: Live Readiness and Smoke Automation

Goal: package the ambient bot operator surface into scripts and runbooks that a
human operator can use against a real realm.

## Scope

Build:
- a real-server ambient bot admin smoke script that logs in through the admin
  API and exercises diagnostics plus control routes
- a rollout and rollback handoff for operators covering pause, logout-all, and
  restore sequences
- final packet doc wiring for the live-readiness and final-QA phases

Do not build:
- a new admin dashboard UI
- a new deployment system
- fake or sim-only verification paths

## Required constraints

- smoke tooling must talk to the real `/admin/api/*` surfaces
- the smoke must restore runtime controls after a pause drill
- logout-all must stay opt-in for smoke runs, not the default path
- live verification notes must call out that admin credentials and a reachable
  realm are required

## Suggested validation

- `node --check scripts/ambient_bot_admin_smoke.mjs`
- `npx vitest run tests/admin.test.ts tests/ambient_player_bot_runtime.test.ts`
- `npm run build:server`

## Acceptance criteria

- Operators have a script they can run against a real realm to verify ambient
  bot diagnostics and control routes.
- Operators have a documented pause, logout-all, restore, and rollback flow.
- The packet is ready for a final QA pass once a reachable live server is
  available.

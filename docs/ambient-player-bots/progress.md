# Progress: Ambient Player Bots

## Status table

| Phase | Status | Started | Completed |
|---|---|---|---|
| 1 | completed | 2026-06-26 | 2026-06-26 |
| 2 | completed | 2026-06-26 | 2026-06-26 |
| 3 | completed | 2026-06-26 | 2026-06-26 |
| 4 | completed | 2026-06-26 | 2026-06-26 |
| 5 | completed | 2026-06-26 | 2026-06-26 |
| 6 | completed | 2026-06-26 | 2026-06-26 |
| 7 | completed | 2026-06-26 | 2026-06-26 |
| 8 | pending | | |
| 9 | pending | | |
| 10 | pending | | |
| 11 | pending | | |
| 12 | pending | | |
| 13 | pending | | |
| 14 | pending | | |
| 15 | pending | | |
| 16 | pending | | |

## Phase 1 checklist

- [x] requirements, vision, and architecture packet created
- [x] ambient bot registry schema landed
- [x] planner service landed
- [x] `GameServer` diagnostics seam landed
- [x] env flags documented
- [x] tests for planner and schema landed
- [x] validation green

Notes:
- Phase 1 is intentionally server-side only. It defines the control plane that
  later phases plug the real runner into.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts`
  - `npm run build:server`
- `npx tsc --noEmit` is not green at the repo baseline right now. The current
  unrelated errors include existing issues in `server/ai/active_triggers.ts`,
  `server/game.ts`, `src/ui/hud.ts`, generated i18n files under
  `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
  `tests/auto_loot.test.ts`.

## Phase 2 checklist

- [x] review Phase 1 implementation against `phase-02-qa-foundation.md`
- [x] add missing tests
- [x] fix blocking or should-fix findings
- [x] mark Phase 1 complete

Notes:
- No blocking findings were left in the Phase 1 slice after review.
- Extra regression confirmation:
  - `npx vitest run tests/game_sessions.test.ts`
- Phase 3 is now the next implementation target.

## Phase 3 checklist

- [x] real `/api/register`, `/api/login`, and `/api/characters` client landed
- [x] real `/ws` auth and snapshot merge client landed
- [x] planner actions now drive a provisioning and login runtime
- [x] `GameServer` and `main.ts` wire ambient sessions through real auth flow
- [x] runtime and ws helper tests landed
- [x] validation green

Notes:
- Phase 3 keeps the runner in the same server process family and loops back
  through the real HTTP and WebSocket surfaces, with no sim-only cheat path.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red at the repo baseline, but no new Phase 3
    errors remain after this slice)
- The current unrelated `tsc` baseline still includes existing issues in
  `server/ai/active_triggers.ts`, `server/game.ts`, `src/ui/hud.ts`, generated
  i18n files under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`,
  and `tests/auto_loot.test.ts`.

## Phase 4 checklist

- [x] audit Phase 3 implementation against `phase-04-qa-real-runner.md`
- [x] add the missing IP-block versus hard-limit gate coverage
- [x] verify runtime, ws helper, and session regressions stay green
- [x] mark Phase 3 ready for the progression brain

Notes:
- QA caught one should-fix edge case: ambient bot sessions were bypassing both
  the hard per-IP cap and the blocked-IP gate. The fix now narrows the bypass
  to the hard cap only.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red at the unrelated repo baseline only)
- Live boot verification against a real local server process is still blocked on
  this workstation because no local Postgres service was listening on `:5433`
  and Docker was not available in PATH during this session.

## Phase 5 checklist

- [x] add a focused progression brain module
- [x] wire connected ambient bots through a periodic brain loop
- [x] complete the `q_wolves` accept, hunt, loot, and turn-in path
- [x] add junk-vendor, low-risk grind, recovery, and stuck-reset behavior
- [x] add brain and runtime regression coverage
- [x] validation green

Notes:
- This slice intentionally stops after the first Eastbrook quest and switches to
  low-risk grinding. It is the first real visible progression loop, not the full
  future quest chain.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`

## Phase 6 checklist

- [x] audit Phase 5 against `phase-06-qa-progression-brain.md`
- [x] restore `npx tsc --noEmit` to the pre-existing repo baseline by fixing
  Phase 5-introduced `brain.ts` type errors
- [x] add missing starter-loop regression coverage for corpse loot and quest
  turn-in
- [x] extend ws helper coverage for delta-carried progression state such as
  `tal`
- [x] verify targeted vitest and `build:server` stay green

Notes:
- QA found one should-fix class of issue in Phase 5: the new progression brain
  introduced fresh `tsc` errors even though the narrow vitest and server build
  were green. Those type issues are now fixed, and `npx tsc --noEmit` is back
  to the unrelated repo baseline only.
- QA also found missing regression coverage for two required starter-loop
  behaviors: looting a nearby corpse and turning `q_wolves` in at Marshal
  Redbrook. Those tests now exist, alongside stronger ws delta-self coverage for
  `tal` and quest state preservation.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in Phase 1 and Phase 4 notes)
- Phase 7 is now the next implementation target.

## Phase 7 checklist

- [x] keep human-cluster identity stable across nearby membership churn
- [x] reuse already-online bots through cluster handoff before forced logout
- [x] shed overflow bots when a cluster target shrinks
- [x] add focused orchestration docs and planner regressions
- [x] validate the Phase 7 slice

Notes:
- This slice stayed inside `server/ambient_bots/service.ts`. No new runtime,
  schema, or `server/game.ts` integration seam was needed.
- The planner now carries cluster identity forward, trims pending overfill, and
  prevents a released bot from immediately reattaching to the same cluster in
  the same planning cycle.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Phase 8 QA is now the next target.

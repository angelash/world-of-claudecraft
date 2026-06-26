# Progress: Ambient Player Bots

## Status table

| Phase | Status | Started | Completed |
|---|---|---|---|
| 1 | completed | 2026-06-26 | 2026-06-26 |
| 2 | completed | 2026-06-26 | 2026-06-26 |
| 3 | pending | | |
| 4 | pending | | |
| 5 | pending | | |
| 6 | pending | | |
| 7 | pending | | |
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
  `server/game.ts`, `server/main.ts`, multiple generated i18n files under
  `src/ui/i18n.resolved.generated/`, and `tests/auto_loot.test.ts`.

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

## Later phases

- Phase 3 and later remain pending. Their detailed scope is locked in
  `implementation-plan.md` and `state.md`.

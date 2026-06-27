# Progress: Online Hosted Play

## Status table

| Phase | Status | Started | Completed |
|---|---|---|---|
| 1 | completed | 2026-06-27 | 2026-06-27 |
| 2 | pending |  |  |
| 3 | pending |  |  |
| 4 | pending |  |  |
| 5 | pending |  |  |
| 6 | pending |  |  |

## Phase 1 checklist

- [x] packet docs created
- [x] hosted runtime module added
- [x] `GameServer` hosted-play integration seam added
- [x] owner API endpoints added
- [x] game-menu owner controls added
- [x] first live automation loop added
- [x] manual-pause safety added
- [x] targeted tests added
- [x] validation green

Notes:
- Phase 1 is intentionally online-only and same-session only.
- The first live loop should reuse the ambient progression brain instead of
  inventing a second automation planner.
- Validation run:
  - `npx vitest run tests/hosted_play_runtime.test.ts tests/hosted_play_game_server.test.ts tests/hosted_play_api.test.ts tests/ambient_player_bot_brain.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`
- Phase 2 is the next QA target.

## Phase 3 checklist

- [ ] persistence schema landed
- [ ] per-character preference round-trip covered
- [ ] login resume policy implemented
- [ ] party support landed
- [ ] validation green

## Phase 5 checklist

- [ ] social shell landed
- [ ] bounded LLM overlay landed
- [ ] audit and fallback coverage landed
- [ ] validation green

# Progress: Online Hosted Play

## Status table

| Phase | Status | Started | Completed |
|---|---|---|---|
| 1 | completed | 2026-06-27 | 2026-06-27 |
| 2 | completed | 2026-06-27 | 2026-06-27 |
| 3 | completed | 2026-06-27 | 2026-06-27 |
| 4 | completed | 2026-06-27 | 2026-06-27 |
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

## Phase 2 checklist

- [x] owner-only hosted-play API verified against the live online path
- [x] manual input pause and resume verified against the live online path
- [x] game-menu Hosted Play panel verified in a real browser session
- [x] pg-mem local verification harness compatibility fixed for character roster loading
- [x] QA validation green

Notes:
- Live API and WebSocket verification was run against the pg-mem realm on
  `http://127.0.0.1:8879`, including enable, pause on manual input, resume
  after the pause window, and disable.
- Browser verification was run through `http://127.0.0.1:5173` with the pg-mem
  server on `http://127.0.0.1:8787`, confirming the Hosted Play panel title,
  button set, and enable or disable state transitions in the real UI.
- QA uncovered a pg-mem execution failure in the character-roster playtime
  query. The fix rewrote the playtime aggregation to subtract epoch values
  instead of subtracting timestamps directly.
- Validation run:
  - `npx vitest run tests/character_db.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_game_server.test.ts tests/hosted_play_api.test.ts tests/ambient_player_bot_brain.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`

## Phase 3 checklist

- [x] persistence schema landed
- [x] per-character preference round-trip covered
- [x] login resume policy implemented
- [x] party support landed
- [x] validation green

Notes:
- Phase 3 persists hosted-play preferences directly on the character row with an
  additive schema update, then threads those preferences through status reads,
  enable calls, and same-session login resume.
- The owner-facing Hosted Play panel now controls both login auto-resume and
  party behavior, and it reports live group coordination state back to the
  player.
- Party support stays on the real server command path by adapting the ambient
  bot `/follow` pattern rather than introducing a hosted-only movement shortcut.
- Validation run:
  - `npx vitest run tests/hosted_play_api.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/hosted_play_game_server.test.ts tests/character_db.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`

## Phase 4 checklist

- [x] additive migration safety verified
- [x] owner settings route verified against the live online path
- [x] login resume correctness verified against the live online path
- [x] party regroup and follow behavior verified in targeted tests
- [x] validation green

Notes:
- The local hosted-play verification server on `http://127.0.0.1:8787` was
  restarted with the latest Phase 3 code before QA.
- Live verification used the real REST and WebSocket path against the pg-mem
  realm: register account, create character, enter the world, save hosted-play
  settings, enable hosted play, disconnect, reconnect, and confirm the
  persisted resume and party settings were restored.
- Focused validation re-ran:
  - `npx vitest run tests/hosted_play_api.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/hosted_play_game_server.test.ts tests/character_db.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`

## Phase 5 checklist

- [ ] social shell landed
- [ ] bounded LLM overlay landed
- [ ] audit and fallback coverage landed
- [ ] validation green

# State: Online Hosted Play

## Current phase

- current phase: Phase 5
- phase status: Phase 4 QA is complete, the packet is ready for social and LLM overlays

## Locked decisions

1. Hosted play is same-session only for the first release.
2. Hosted play must not create a second live session for the same character.
3. Hosted play attaches to a real owner-controlled live `ClientSession`.
4. Manual player input always has priority over automation.
5. The first slice is online-only. Offline delegated play and login takeover are
   later work.
6. Reuse the ambient progression brain where it fits before extracting shared
   helpers.
7. `server/game.ts` changes should stay limited to named hosted-play seams.
8. LLMs are later overlays, not part of the first hosted-play release.

## Non-negotiable constraints

- server authority remains intact
- no `Math.random`, `Date.now`, or `performance.now` inside `src/sim/`
- no hidden sim-only hosted-play mutation path
- preserve unrelated user changes
- no placeholder implementations

## Validation matrix

- docs only:
  - manual review for packet consistency
- hosted runtime and server seam slice:
  - `npx vitest run tests/hosted_play_runtime.test.ts tests/hosted_play_game_server.test.ts tests/ambient_player_bot_brain.test.ts`
  - `npm run build:server`
- client UI and API slice:
  - `npx vitest run tests/hosted_play_api.test.ts`
  - `npm run build`
- Phase 3 implementation target:
  - `npx vitest run tests/hosted_play_api.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/hosted_play_game_server.test.ts tests/character_db.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`
- Phase 4 QA target:
  - restart the local hosted-play verification server before validation
  - `npx vitest run tests/hosted_play_api.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/hosted_play_game_server.test.ts tests/character_db.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`
  - live HTTP and WebSocket verification of hosted-play settings save and login resume
- Phase 2 QA target:
  - `npx vitest run tests/character_db.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_game_server.test.ts tests/hosted_play_api.test.ts tests/ambient_player_bot_brain.test.ts tests/companion_read_api.test.ts`
  - `npm run build:server`
  - `npm run build`
- Phase 1 pre-commit target:
  - `npx vitest run tests/hosted_play_runtime.test.ts tests/hosted_play_game_server.test.ts tests/hosted_play_api.test.ts tests/ambient_player_bot_brain.test.ts`
  - `npm run build:server`
  - `npm run build`

## Planned files and surfaces

### Phase 1

- `server/hosted_play/runtime.ts`
- `server/hosted_play/types.ts`
- `server/main.ts`
- `server/game.ts`
- `src/net/online.ts`
- `src/ui/hud.ts`
- `src/main.ts`
- `src/ui/i18n.catalog/hud_chrome.ts`
- `src/ui/i18n.resolved.generated/*`
- `src/ui/i18n.status.summary.json`
- `tests/hosted_play_runtime.test.ts`
- `tests/hosted_play_game_server.test.ts`
- `tests/hosted_play_api.test.ts`

## Active API surface

- `GET /api/characters/:id/hosted-play`
- `POST /api/characters/:id/hosted-play`
- `DELETE /api/characters/:id/hosted-play`
- `PUT /api/characters/:id/hosted-play/settings`

## Active user-facing state

- enabled
- active
- paused
- objective label
- pause reason
- last error
- last automation activity time
- resume on login preference
- party mode preference
- group coordination mode
- group leader name
- group leader distance

## Known risks

- The hosted runtime must not leave held movement active after a manual player
  action.
- Any internal hosted action path must not regress idle timeout handling or
  player bot-detection behavior.
- Login auto-resume must never create a second live session or bypass the
  existing online-owner gate.
- Party follow must stay on the real `/follow` chat path so hosted play does
  not gain a movement privilege that normal players do not have.
- The local pg-mem verification harness relies on the character-roster query
  staying compatible with timestamp arithmetic it can execute. Keep playtime
  rollups expressed as epoch subtraction when possible.

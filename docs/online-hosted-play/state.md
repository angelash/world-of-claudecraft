# State: Online Hosted Play

## Current phase

- current phase: Phase 1
- phase status: in progress

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
- `tests/hosted_play_runtime.test.ts`
- `tests/hosted_play_game_server.test.ts`
- `tests/hosted_play_api.test.ts`

## Planned API surface

- `GET /api/characters/:id/hosted-play`
- `POST /api/characters/:id/hosted-play`
- `DELETE /api/characters/:id/hosted-play`

## Planned user-facing state

- enabled
- active
- paused
- objective label
- pause reason
- last error
- last automation activity time

## Known risks

- The hosted runtime must not leave held movement active after a manual player
  action.
- Any internal hosted action path must not regress idle timeout handling or
  player bot-detection behavior.

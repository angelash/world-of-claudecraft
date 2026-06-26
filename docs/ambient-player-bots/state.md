# State: Ambient Player Bots

## Current phase

- current phase: 3
- phase status: pending implementation

## Locked decisions

1. Ambient bots ultimately play through the real HTTP and WebSocket server
   surfaces. They do not get privileged sim-only cheat paths in production.
2. The server owns orchestration. A separate runner owns low-level execution.
3. Human players are grouped into shared nearby clusters. The target is about
   five visible bots for a solo player, with shared pods for nearby humans.
4. LLMs are sparse and bounded. They generate plans, social intent, and memory
   summaries, not direct authoritative world mutation.
5. `src/sim/` remains deterministic and unaware of models. Any player-facing bot
   intelligence beyond normal commands lives outside the sim.
6. Bot lifecycles need hysteresis: assignment radius, larger release radius,
   cooldowns, and reservation TTLs.
7. The first shipping slices prioritize foundations over spectacle. Registry,
   planner, runner, and progression should land before free-form social AI.

## Non-negotiable constraints

- server authority remains intact
- no `Math.random`, `Date.now`, or `performance.now` inside `src/sim/`
- no giant fork-only logic branches inside `server/game.ts`
- additive DB DDL only
- preserve unrelated user changes
- no placeholder TODO implementations

## Validation matrix

- docs only:
  - manual review for consistency and phase coverage
- ambient planner or server-only slice:
  - `npx tsc --noEmit`
  - targeted vitest files for the new modules
  - `npm run build:server`
- schema or persistence slice:
  - schema string tests
  - repository normalization tests
  - additive DDL review
- full-stack or runner slice:
  - `npx tsc --noEmit`
  - runner and server vitest files
  - real-wire script or smoke flow when available
- pre-merge gate:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build:env`
  - `npm run build:server`
  - `npm run build`

## Planned files and surfaces

### Phase 1

- `server/ambient_bots/types.ts`
- `server/ambient_bots/config.ts`
- `server/ambient_bots/profiles.ts`
- `server/ambient_bots/service.ts`
- `server/ambient_player_bot_db.ts`
- `tests/ambient_player_bot_service.test.ts`
- `tests/ambient_player_bot_db.test.ts`
- `tests/ambient_player_bot_game_server.test.ts`
- a small `server/game.ts` integration seam
- `.env.example` ambient bot flags

### Later phases

- `headless/` or `scripts/` real-server runner modules
- provisioning worker
- social memory persistence
- operator endpoints and UI

## Planned database shape

### Phase 1

`ambient_player_bots`
- persistent bot identity and lifecycle row
- account and character references
- profile id and class
- level band and preferred zones
- lifecycle status, provision state, assignment, cooldown, planner state

### Later phases

- social memory and relationship tables, if bot memory needs separation from the
  current NPC memory store
- optional run ledger or queue tables if runners become multi-process

## Planned runtime flags

### Phase 1

- `AMBIENT_PLAYER_BOTS_EXPERIMENT`
- `AMBIENT_PLAYER_BOTS_INTERVAL_MS`
- `AMBIENT_PLAYER_BOTS_CLUSTER_RADIUS`
- `AMBIENT_PLAYER_BOTS_RELEASE_RADIUS`
- `AMBIENT_PLAYER_BOTS_SOLO_TARGET`
- `AMBIENT_PLAYER_BOTS_EXTRA_PER_PLAYER`
- `AMBIENT_PLAYER_BOTS_MAX_PER_CLUSTER`
- `AMBIENT_PLAYER_BOTS_MAX_PROVISION_PER_TICK`
- `AMBIENT_PLAYER_BOTS_COOLDOWN_MS`
- `AMBIENT_PLAYER_BOTS_RESERVATION_MS`

## Known open items

- public disclosure policy is still a product decision, not a code blocker
- future anti-bot integration path must be decided before production rollout
- the exact real-runner host location is still open: same repo process family,
  sibling service, or dedicated worker host
- repo-wide `npx tsc --noEmit` is currently red for unrelated pre-existing
  issues outside this feature slice. The current baseline includes existing
  errors in `server/ai/active_triggers.ts`, `server/game.ts`, `server/main.ts`,
  generated i18n files under `src/ui/i18n.resolved.generated/`, and
  `tests/auto_loot.test.ts`.

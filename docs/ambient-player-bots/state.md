# State: Ambient Player Bots

## Current phase

- current phase: 13
- phase status: pending Phase 13 implementation after Phase 12 QA

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
8. The initial real runner lives in the same server process family and loops
   back through the real HTTP and WebSocket surfaces. If scale later demands a
   split worker, it should keep the same runtime contract.
9. Ambient bot sessions may bypass the hard per-IP socket cap, but they must
   still respect the blocked-IP gate.
10. The first progression brain is heuristic and reconstructible from live
    snapshot state. It does not introduce per-tick persistence or sim-only
    progression memory.
11. Progression pathing should use the live `/ws` hello seed plus shared sim
    pathfinding helpers so reconnects and future realm seed changes stay safe.
12. When a live cluster changes shape, the planner should prefer stable cluster
    identity and online-bot handoff before forcing logout and fresh-login churn.
13. The first social shell stays heuristic and bounded: real whispers, friend
    adds, and presence emotes now, with free-form generation deferred to the
    later LLM phases.
14. Phase 11 keeps LLMs as advisory overlays only: they may shape social mode,
    cover-story text, friend policy, and whisper phrasing, but they never issue
    direct movement, combat, quest, or economy authority.
15. The first LLM provider path is a local Codex CLI bridge owned by the
    ambient bot runtime. Shared provider pooling can wait for a later operator
    and rollout phase.

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
- progression brain slice:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
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

### Phase 3

- `server/ambient_bots/api_client.ts`
- `server/ambient_bots/naming.ts`
- `server/ambient_bots/runtime.ts`
- `server/ambient_bots/ws_client.ts`
- `server/main.ts` ambient bot runtime and auth wiring
- `server/game.ts` planner action handler and record upsert seam
- `tests/ambient_player_bot_runtime.test.ts`
- `tests/ambient_player_bot_ws_client.test.ts`

### Phase 5

- `server/ambient_bots/brain.ts`
- `docs/ambient-player-bots/phase-05-progression-brain.md`
- `docs/ambient-player-bots/phase-06-qa-progression-brain.md`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `tests/ambient_player_bot_ws_client.test.ts`

### Phase 7

- `server/ambient_bots/service.ts`
- `docs/ambient-player-bots/phase-07-human-cluster-orchestration.md`
- `docs/ambient-player-bots/phase-08-qa-human-cluster-orchestration.md`
- `tests/ambient_player_bot_service.test.ts`

### Phase 9

- `server/ambient_bots/social.ts`
- `server/ambient_bots/runtime.ts`
- `server/ambient_bots/ws_client.ts`
- `docs/ambient-player-bots/phase-09-social-shell-memory.md`
- `docs/ambient-player-bots/phase-10-qa-social-shell-memory.md`
- `tests/ambient_player_bot_social.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `tests/ambient_player_bot_ws_client.test.ts`

### Phase 11

- `server/ambient_bots/llm_types.ts`
- `server/ambient_bots/llm_prompt.ts`
- `server/ambient_bots/llm_validate.ts`
- `server/ambient_bots/llm_provider.ts`
- `server/ambient_bots/llm_coordinator.ts`
- `server/ambient_bots/social.ts`
- `server/ambient_bots/runtime.ts`
- `server/main.ts`
- `.env.example`
- `docs/ambient-player-bots/phase-11-llm-social-plan-integration.md`
- `tests/ambient_player_bot_llm.test.ts`
- `tests/ambient_player_bot_social.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`

### Phase 12

- `docs/ambient-player-bots/phase-12-qa-llm-social-plan-integration.md`
- `tests/ambient_player_bot_runtime.test.ts`
- `tests/ambient_player_bot_ws_client.test.ts`

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

### Phase 11

- `AMBIENT_PLAYER_BOTS_LLM_ENABLED`
- `AMBIENT_PLAYER_BOTS_LLM_TIMEOUT_MS`
- `AMBIENT_PLAYER_BOTS_LLM_PLAN_COOLDOWN_MS`
- `AMBIENT_PLAYER_BOTS_LLM_SOCIAL_COOLDOWN_MS`
- `AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_5H`
- `AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_WEEK`
- `AMBIENT_PLAYER_BOTS_LLM_CACHE_MAX_ENTRIES`
- `AMBIENT_PLAYER_BOTS_LLM_CACHE_MAX_TTL_MS`

## Known open items

- public disclosure policy is still a product decision, not a code blocker
- future anti-bot integration path must be decided before production rollout
- later extraction of the real runner into a sibling service or dedicated worker
  host is still open if scale demands it, but the Phase 3 shipping slice now
  runs in the same process family
- the current progression brain covers the Eastbrook starter quest and then
  falls back to low-risk grinding. Follow-on quest chains, replenishment buys,
  and higher-level routing remain future work
- Phase 6 QA closed the local progression-brain gaps for starter quest turn-in,
  corpse loot coverage, and ws delta-self preservation. No new known Phase 5
  blocker remains after that audit
- Phase 7 added stable cluster continuity, online handoff, and overflow
  load-shedding in the planner. Phase 8 should now audit for missed hysteresis
  or population-thrash edge cases
- Phase 8 QA added explicit regression coverage that a bot released for drift
  cannot reattach to the same cluster in the same planner cycle. No new Phase 7
  blocker remains after that audit
- Phase 9 added bounded whisper handling, relationship memory in `social_state`,
  presence emotes, and friend-add shell logic. Phase 10 QA closed the direct
  ws social-frame coverage gap, so no new known Phase 9 blocker remains after
  that audit
- Phase 11 added bounded LLM plan and whisper overlays, structured audit
  snapshots, semantic cache keys, and downgrade paths back to the heuristic
  social shell. Phase 12 closed the explicit fallback regression and the
  ambient-bot ws-client test type gap, so no new known Phase 11 blocker
  remains after that audit
- full live boot verification of the real runner on this workstation still
  needs a reachable local Postgres service
- repo-wide `npx tsc --noEmit` is currently red for unrelated pre-existing
  issues outside this feature slice. The current baseline includes existing
  errors in `server/ai/active_triggers.ts`, `server/game.ts`, `src/ui/hud.ts`,
  generated i18n locale and resolved files under `src/ui/i18n.locales/` and
  `src/ui/i18n.resolved.generated/`, and `tests/auto_loot.test.ts`.

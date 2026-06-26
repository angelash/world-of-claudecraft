# State: Ambient Player Bots

## Current phase

- current phase: continuation 17 QA
- phase status: Continuation 17 implementation is complete, and QA now closes
  the second Gravewyrm Sanctum bridge around `q_velkhar`, party re-entry,
  Velkhar pursuit, and dungeon exit, packet teardown deferred until the
  continuation ladder closes

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
16. In progression routing, `requiresQuest` means the prerequisite quest must
    be turned in, not merely active, so starter overlap must stay limited to
    chains whose live quest definitions truly allow parallel actives.
17. The Stormcrag outdoor pair should stay local to one outing: once
    `q_shard_cores` is active at level 17, the bot should pick up `q_kazzix`
    before leaving Highwatch and defer the ready shard-core turn-in while
    Kazzix remains active.
18. Grouped objective coordination must match nearby same-cluster bots on the
    same live grouped quest or dungeon target. Outdoor grouped objectives
    should not collapse into one broad same-cluster outdoor pool.
19. The Gravewyrm Sanctum boss ladder should stay sequential: `q_korgath`,
    then `q_velkhar`, then the later final boss bridge, with no overlap or
    skip past an unfinished earlier Sanctum boss step.

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
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs` when the workstation has
    no local Postgres service
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
- later operator UI wiring and smoke automation

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

### Phase 13

- `server/ambient_bots/config.ts`
- `server/ambient_bots/llm_coordinator.ts`
- `server/ambient_bots/runtime.ts`
- `server/ambient_bots/service.ts`
- `server/ambient_bots/types.ts`
- `server/admin.ts`
- `server/game.ts`
- `server/main.ts`
- `docs/ambient-player-bots/phase-13-admin-telemetry-incident-controls.md`
- `docs/ambient-player-bots/phase-14-qa-admin-telemetry-incident-controls.md`
- `tests/ambient_player_bot_llm.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `tests/ambient_player_bot_service.test.ts`
- `tests/admin.test.ts`

### Phase 15

- `scripts/ambient_bot_admin_smoke.mjs`
- `docs/ambient-player-bots/phase-15-live-readiness-smoke-automation.md`
- `docs/ambient-player-bots/phase-16-final-qa-teardown.md`
- `docs/ambient-player-bots/rollout-handoff.md`
- `docs/ambient-player-bots/qa-checklist.md`

### Phase 16

- `scripts/ambient_bot_pgmem_support.mjs`
- `scripts/ambient_bot_server_pgmem.mjs`
- `scripts/ambient_bot_admin_smoke_pgmem.mjs`
- `package.json`
- `package-lock.json`
- `docs/ambient-player-bots/progress.md`
- `docs/ambient-player-bots/state.md`
- `docs/ambient-player-bots/phase-16-final-qa-teardown.md`
- `docs/ambient-player-bots/rollout-handoff.md`
- `docs/ambient-player-bots/qa-checklist.md`

### Continuation 01

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/naming.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_naming.test.ts`
- `docs/ambient-player-bots/continuation-01-expanded-solo-progression.md`
- `docs/ambient-player-bots/continuation-01-qa-expanded-solo-progression.md`

### Continuation 02

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `server/ambient_bots/runtime.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-02-object-interaction-progression.md`
- `docs/ambient-player-bots/continuation-02-qa-object-interaction-progression.md`

### Continuation 03

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `docs/ambient-player-bots/continuation-03-mixed-source-collection-progression.md`
- `docs/ambient-player-bots/continuation-03-qa-mixed-source-collection-progression.md`

### Continuation 04

- `server/ambient_bots/brain.ts`
- `scripts/ambient_bot_pgmem_support.mjs`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-04-town-resupply-and-consumables.md`
- `docs/ambient-player-bots/continuation-04-qa-town-resupply-and-consumables.md`

### Continuation 05

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-05-cross-zone-fenbridge-progression.md`
- `docs/ambient-player-bots/continuation-05-qa-cross-zone-fenbridge-progression.md`

### Continuation 06

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-06-mirefen-side-chains-and-fenbridge-resupply.md`
- `docs/ambient-player-bots/continuation-06-qa-mirefen-side-chains-and-fenbridge-resupply.md`

### Continuation 07

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `docs/ambient-player-bots/continuation-07-mirefen-troll-and-cultist-outdoors.md`
- `docs/ambient-player-bots/continuation-07-qa-mirefen-troll-and-cultist-outdoors.md`

### Continuation 08

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `docs/ambient-player-bots/continuation-08-cult-summoners-deacon-and-bastion-approach.md`
- `docs/ambient-player-bots/continuation-08-qa-cult-summoners-deacon-and-bastion-approach.md`

### Continuation 09

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/group.ts`
- `server/ambient_bots/progression_routes.ts`
- `server/ambient_bots/runtime.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-09-bastion-party-and-dungeon-bridge.md`
- `docs/ambient-player-bots/continuation-09-qa-bastion-party-and-dungeon-bridge.md`

### Continuation 10

- `server/ambient_bots/group.ts`
- `server/ambient_bots/runtime.ts`
- `tests/ambient_player_bot_group.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-10-bastion-in-dungeon-cohesion.md`
- `docs/ambient-player-bots/continuation-10-qa-bastion-in-dungeon-cohesion.md`

### Continuation 11

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-11-highwatch-handoff-and-thornpeak-starters.md`
- `docs/ambient-player-bots/continuation-11-qa-highwatch-handoff-and-thornpeak-starters.md`

### Continuation 12

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-12-thornpeak-warfront-and-elemental-outdoors.md`
- `docs/ambient-player-bots/continuation-12-qa-thornpeak-warfront-and-elemental-outdoors.md`

### Continuation 13

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-13-thornpeak-cultists-and-revenants.md`
- `docs/ambient-player-bots/continuation-13-qa-thornpeak-cultists-and-revenants.md`

### Continuation 14

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-14-thornpeak-sanctum-approach.md`
- `docs/ambient-player-bots/continuation-14-qa-thornpeak-sanctum-approach.md`

### Continuation 15

- `server/ambient_bots/group.ts`
- `server/ambient_bots/progression_routes.ts`
- `server/ambient_bots/runtime.ts`
- `tests/ambient_player_bot_group.test.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-15-thornpeak-ogre-war-camp-groups.md`
- `docs/ambient-player-bots/continuation-15-qa-thornpeak-ogre-war-camp-groups.md`

### Continuation 16

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-16-korgath-sanctum-threshold.md`
- `docs/ambient-player-bots/continuation-16-qa-korgath-sanctum-threshold.md`

### Continuation 17

- `server/ambient_bots/progression_routes.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_runtime.test.ts`
- `docs/ambient-player-bots/continuation-17-velkhar-sanctum-bridge.md`
- `docs/ambient-player-bots/continuation-17-qa-velkhar-sanctum-bridge.md`

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
- Continuation 01 reopens the packet because the original local runtime and
  operator ladder did not yet satisfy the broader "play through the game"
  progression goal
- the current progression brain now covers the Eastbrook solo kill chain
  through `q_ringleader`, not just `q_wolves`
- local `pg-mem` live verification now reaches a real ambient bot session after
  a human logs in, and the runtime exposes a real objective such as
  `accept_wolves` through the admin diagnostics surface
- Continuation 02 adds collect-object progression support for `q_supplies`,
  `q_whispers`, and `q_names_of_the_dead`, plus the supporting Aldric kill
  routes around them
- Continuation 03 adds mixed-source collection routing for `q_rite`, with
  route-level sub-objective gating based on live quest-log counts and distinct
  objective ids for route handoff
- Continuation 04 adds town resupply through Trader Wilkes, using live
  inventory counts, copper, and real vendor buy commands for food and drink
- Continuation 04 QA confirmed the resupply layer still defers to nearby NPC
  quest flow, still sells junk before buying, and adds no new smoke or build
  regressions
- the local pg-mem harness now strips one unsupported suspicious-registration
  regex predicate so admin smoke output stays clean on this workstation
- Continuation 05 extends the route registry into the Fenbridge starter ladder
  and adds distinct turn-in NPC support for cross-zone handoff quests
- the current progression brain now covers Fenbridge starter routes through
  `q_deepfen_purge`
- Continuation 05 QA confirmed the Fenbridge handoff stays data-driven and does
  not break earlier same-NPC route flow
- Continuation 06 extends the route registry into the widow and drowned Mirefen
  side chains and moves north-zone sustain to Provisioner Hale
- the current progression brain now covers Mirefen side routes through
  `q_no_rest`
- Continuation 06 QA confirmed Fenbridge-local sustain does not break the
  earlier Eastbrook vendor flow
- Continuation 07 extends the route registry into the Broodmother, troll,
  Grubjaw, and first cult-camp outdoor chain
- the current progression brain now covers Mirefen outdoor routes through
  `q_cult_camp`
- Continuation 07 QA confirmed the Broodmother handoff and the troll or cult
  route order add no new progression regressions
- Continuation 08 extends the route registry into `q_summoners`, `q_deacon`,
  and `q_bastion_door`
- the `q_summoners` cipher stage now supports bounded multi-source kill routing
  with summoners preferred and menders as the valid fallback source
- the current progression brain now covers Mirefen outdoor routes through
  `q_bastion_door`
- Continuation 08 QA confirmed the cipher stage ignores nearby non-dropping
  cultists and stays reconstructible from live quest counts only
- Continuation 09 extends the route registry into `q_olen` and `q_mistcaller`
- the progression brain now supports Bastion dungeon entry, in-instance Olen
  and Vael routing, and dungeon exit for the Bastion turn-in handoff
- the runtime now has a bounded ambient-party bridge that uses real `pinvite`,
  `paccept`, and `enter_dungeon` commands for nearby same-cluster bots
- Continuation 10 adds an in-dungeon cohesion layer for Sunken Bastion:
  trailing followers use the normal `/follow <leader>` chat path, and the
  leader pauses brain-driven movement or clean pulls while another ambient
  party member is visibly lagging
- `loginBot` runtime actions now persist the planner-provided cluster
  assignment and target character id before the socket connect path, so
  downstream orchestration layers can trust those fields during the first live
  brain loop
- the current progression brain now covers the Zone 2 ladder through
  `q_mistcaller`
- Continuation 09 QA confirmed the Bastion accept order, real party-command
  bridge, dungeon entry, Olen-first routing, and dungeon exit handoff under the
  focused validation matrix
- Continuation 10 QA is complete, and continuation 11 now targets the Zone 3
  handoff beyond Mirefen plus the first Highwatch starter ladder
- Continuation 11 extends the route registry into `q_highwatch_summons`,
  `q_stalkers`, `q_stalker_pelts`, `q_kobold_tunnels`, and `q_glowing_wax`
- the current progression brain now covers the Highwatch handoff and first
  Thornpeak starter ladder through `q_glowing_wax`
- Thornpeak-local sustain now uses Quartermaster Bree, and fallback grinding
  stays in-zone on ridge stalkers or Deeprock kobolds instead of walking back
  to Eastbrook while the next quest gate is level-bound
- Continuation 11 QA is complete, and continuation 12 should next cover the
  mid-Thornpeak outdoor warfront around `q_ogre_edges`, `q_ogre_totems`,
  `q_ogre_bounty`, `q_elementals`, `q_shard_cores`, and `q_kazzix`
- Continuation 12 extends the route registry into `q_ogre_edges`,
  `q_ogre_totems`, `q_ogre_bounty`, `q_elementals`, `q_shard_cores`, and
  `q_kazzix`
- the current progression brain now covers the Zone 3 outdoor ladders through
  `q_kazzix`
- Thornpeak-local fallback grinding now advances from ridge stalkers to
  kobolds, then ogres, then Stormcrag elementals as the current quest gate
  moves north
- Continuation 12 QA is complete, and continuation 13 should next cover the
  late-Thornpeak solo outdoor ladder around `q_zealots`, `q_cult_orders`,
  `q_necromancers`, `q_revenants`, and `q_revenant_vanguard`
- Continuation 13 extends the route registry into `q_zealots`,
  `q_cult_orders`, `q_necromancers`, `q_revenants`, and
  `q_revenant_vanguard`
- the current progression brain now covers the late Zone 3 solo outdoor
  ladders through `q_revenant_vanguard`
- the Wyrmcult mixed-objective routes now stay bounded to zealot and
  necromancer hunt routes so both kill and collect progress can be reconstructed
  from live quest counts and the correct mob family only
- Continuation 13 QA is complete, and continuation 14 should next cover the
  Sanctum-approach outdoor prep ladder around `q_wyrm_sigils`,
  `q_breaking_the_seal`, `q_voice_below`, and `q_sanctum_gate`
- Continuation 14 extends the route registry into `q_wyrm_sigils`,
  `q_breaking_the_seal`, `q_voice_below`, and `q_sanctum_gate`
- the current progression brain now covers the Zone 3 outdoor ladder through
  `q_sanctum_gate`
- the mixed `q_voice_below` congregation cleanup now stays bounded to zealot
  and necromancer hunt routes with live quest-count handoff between the two
  objective stages
- Continuation 14 QA is complete, and continuation 15 should next generalize
  grouped objective coordination beyond dungeon-only flow before covering
  `q_crushers` and `q_drogmar`
- Continuation 15 generalizes grouped coordination beyond dungeon-only flow and
  extends the progression registry into `q_crushers` and `q_drogmar`
- grouped objective matching now keys on the live dungeon id when present, or
  on the live grouped quest id for outdoor party objectives
- the current progression brain now covers the grouped Thornpeak ogre war-camp
  chain through `q_drogmar`
- Continuation 15 QA is complete, including a direct regression that a
  same-cluster `q_drogmar` bot is not treated as a `q_crushers` party
  candidate
- Continuation 16 extends the progression registry into `q_korgath` with the
  existing live dungeon-entry bridge for `gravewyrm_sanctum`
- the current progression brain now covers grouped Thornpeak progression
  through `q_korgath`
- Continuation 16 QA is complete, and continuation 17 should next cover the
  deeper Gravewyrm Sanctum boss bridge around `q_velkhar` before the final
  `q_gravewyrm` push
- Continuation 17 extends the progression registry into `q_velkhar` with the
  existing live dungeon-entry bridge for `gravewyrm_sanctum`
- the current progression brain now covers grouped Thornpeak progression
  through `q_velkhar`
- Continuation 17 QA should next confirm that the Velkhar bridge adds no
  regressions before the final `q_gravewyrm` push
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
- Phase 13 added a combined admin diagnostics surface, live planner config
  updates, runtime pause levers, and logout-all incident control. Phase 14
  should now audit operator workflows, skipped-action behavior, and fail-safe
  reset semantics before Phase 15 live readiness work begins
- Phase 14 QA tightened logout-all so it only resets active or assigned bots
  and added direct planner-config route coverage. No new known Phase 13 or
  Phase 14 blocker remains after that audit
- Phase 16 added a local `pg-mem` realm harness, and the ambient-bot admin
  smoke now passes end to end on this workstation without Docker or Postgres.
  A separate staging or production smoke is still an operational follow-up when
  such an environment is available, not a packet blocker.
- packet teardown is deferred until the continuation ladder closes and still
  requires explicit user confirmation before removal
- repo-wide `npx tsc --noEmit` is currently red for unrelated pre-existing
  issues outside this feature slice. The current baseline includes existing
  errors in `server/ai/active_triggers.ts`, `server/game.ts`, `src/ui/hud.ts`,
  generated i18n locale and resolved files under `src/ui/i18n.locales/` and
  `src/ui/i18n.resolved.generated/`, and `tests/auto_loot.test.ts`.

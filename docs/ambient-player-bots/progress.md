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
| 8 | completed | 2026-06-26 | 2026-06-26 |
| 9 | completed | 2026-06-26 | 2026-06-26 |
| 10 | completed | 2026-06-26 | 2026-06-26 |
| 11 | completed | 2026-06-26 | 2026-06-26 |
| 12 | completed | 2026-06-26 | 2026-06-26 |
| 13 | completed | 2026-06-26 | 2026-06-26 |
| 14 | completed | 2026-06-26 | 2026-06-26 |
| 15 | completed | 2026-06-26 | 2026-06-26 |
| 16 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 01 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 01 QA | pending | 2026-06-26 |  |
| Continuation 02 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 02 QA | pending | 2026-06-26 |  |
| Continuation 03 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 03 QA | pending | 2026-06-26 |  |
| Continuation 04 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 04 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 05 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 05 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 06 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 06 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 07 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 07 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 08 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 08 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 09 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 09 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 10 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 10 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 11 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 11 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 12 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 12 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 13 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 13 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 14 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 14 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 15 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 15 QA | completed | 2026-06-26 | 2026-06-26 |
| Continuation 16 | completed | 2026-06-26 | 2026-06-26 |
| Continuation 16 QA | pending | 2026-06-26 |  |

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
- Phase 8 QA completed and Phase 9 is now the next implementation target.

## Phase 8 checklist

- [x] audit Phase 7 against `phase-08-qa-human-cluster-orchestration.md`
- [x] add missing regression coverage for same-cycle reattachment blocking
- [x] verify cluster continuity, handoff, and overflow regressions stay green
- [x] confirm `build:server` still passes and `tsc` adds no new feature errors

Notes:
- QA did not uncover a new planner logic bug in the Phase 7 slice, but it did
  find one missing guardrail in the regression suite: we did not yet prove that
  a bot released for drift could not immediately reattach to the same cluster in
  the same plan cycle. That regression now exists.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed in
    Phase 7 notes)
- Phase 9 is now the next implementation target.

## Phase 9 checklist

- [x] add ws handling for ambient bot `events`, `social`, and `socialpos`
- [x] add a focused social shell module with delayed whisper replies
- [x] persist lightweight relationship memory in existing `social_state`
- [x] add bounded friend-add shell and presence emotes
- [x] add focused social shell and runtime tests
- [x] validate the Phase 9 slice

Notes:
- This slice stayed inside the ambient bot runtime family. It did not need new
  server social tables or deeper `server/game.ts` branching.
- The new social shell is fully heuristic and bounded: it uses real chat and
  friend commands, stores lightweight contact memory in `social_state`, and
  deliberately defers free-form generation to the later LLM phases.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed in
    Phase 7 notes)
- Phase 10 QA is now the next target.

## Phase 10 checklist

- [x] audit Phase 9 against `phase-10-qa-social-shell-memory.md`
- [x] add missing direct ws coverage for `social`, `socialpos`, and `events`
- [x] verify delayed replies, block compliance, and social memory regressions stay green
- [x] confirm `build:server` still passes and `tsc` adds no new feature errors

Notes:
- QA did not uncover a new runtime logic bug in the Phase 9 slice, but it did
  reveal one coverage gap: ws social-frame handling was only covered indirectly
  through runtime tests. The direct ws client regression now proves the bot
  client ingests `social`, `socialpos`, and `events` frames correctly.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed in
    Phase 7 notes)
- Phase 11 completed and Phase 12 QA is now the next target.

## Phase 11 checklist

- [x] add bounded plan and whisper-reply LLM schemas
- [x] add prompt builder, validator, provider, coordinator, and audit plumbing
- [x] wire low-frequency plan and social requests into the ambient bot runtime
- [x] document Phase 11 env flags and downgrade behavior
- [x] add focused coordinator, social-shell, and runtime regressions
- [x] validate the Phase 11 slice

Notes:
- This slice keeps the model strictly outside authoritative gameplay. The LLM
  can only influence social stance, optional friend policy, optional presence
  emote allowance, and bounded whisper text.
- The first provider path is a local ambient-bot-specific Codex CLI bridge. It
  intentionally does not reuse the broader AI app-server path yet.
- The semantic cache now ignores per-call job ids so repeat prompts can hit
  cache without reusing stale request identifiers in the returned decision.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
- `npx tsc --noEmit` (still red only at the current repo baseline, which now
    includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`,
    `tests/ambient_player_bot_ws_client.test.ts`, and `tests/auto_loot.test.ts`)
- Phase 12 QA is now the next target.

## Phase 12 checklist

- [x] audit Phase 11 against `phase-12-qa-llm-social-plan-integration.md`
- [x] add a runtime regression for rejected LLM whisper output fallback
- [x] restore `tests/ambient_player_bot_ws_client.test.ts` to the unrelated repo baseline
- [x] verify focused vitest and `build:server` stay green
- [x] confirm `npx tsc --noEmit` adds no new Phase 11 or Phase 12 errors

Notes:
- QA did not uncover a new authoritative-runtime bug in the Phase 11 slice, but
  it did reveal two issues worth closing before Phase 13. First, the rejected
  social-output path needed an explicit runtime regression so fallback replies
  stay protected. Second, the existing ws client test still carried an old
  outer-scope type hole that polluted the repo-wide `tsc` baseline.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the current repo baseline, which now
    includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Phase 13 is now the next implementation target.

## Phase 13 checklist

- [x] add combined planner, runtime, and LLM diagnostics snapshots for admin
  use
- [x] add live planner config updates for rollout tuning
- [x] add runtime controls for pausing login, provisioning, and LLM overlays
- [x] add an emergency logout-all operator control for active runners
- [x] add focused admin, runtime, service, and LLM regressions
- [x] validate the Phase 13 slice

Notes:
- This slice stays outside authoritative gameplay. It adds observability and
  operator levers around the existing planner and real-wire runtime instead of
  adding a new privileged control path.
- The admin surface now exposes `/admin/api/ambient-bots`,
  `/admin/api/ambient-bots/config`, `/admin/api/ambient-bots/control`, and
  `/admin/api/ambient-bots/logout-all`.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Phase 14 QA is now the next target.

## Phase 14 checklist

- [x] audit Phase 13 against `phase-14-qa-admin-telemetry-incident-controls.md`
- [x] tighten logout-all so it only resets active or assigned ambient bots
- [x] add the missing admin planner-config route regression
- [x] verify focused ambient-bot and admin validation still passes
- [x] confirm `npx tsc --noEmit` adds no new Phase 13 or Phase 14 errors

Notes:
- QA found one should-fix incident-control edge case: the first logout-all pass
  reset every bot record in the directory, even idle unassigned bots. The
  runtime now limits that reset path to active or assigned records only.
- QA also found one missing route regression: the dedicated planner-config admin
  endpoint did not yet have direct coverage. That regression now exists.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Phase 15 is now the next implementation target.

## Phase 15 checklist

- [x] add a real-admin ambient bot smoke script
- [x] add rollout, rollback, pause, and restore handoff notes
- [x] wire Phase 15 and Phase 16 packet docs into the planning index
- [x] validate the new smoke script syntax and operator-surface regressions

Notes:
- This slice packages the operator surface into reusable tooling, but the
  actual real-realm smoke still needs a reachable server plus admin
  credentials. The workstation currently has no listeners on `:8787` or
  `:5173`, so only syntax and focused regression validation ran here.
- Validation run:
  - `node --check scripts/ambient_bot_admin_smoke.mjs`
  - `npx vitest run tests/admin.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npm run build:server`
- Phase 16 final QA is now the next target.

## Phase 16 checklist

- [x] add a repeatable local `pg-mem` realm harness for Phase 16 smoke on
  workstations without Docker or Postgres
- [x] run the ambient bot admin smoke end to end against the local harness
- [x] rerun the focused ambient-bot and admin validation suite
- [x] confirm `npm run build:server` stays green
- [x] confirm `npx tsc --noEmit` adds no new ambient-bot errors beyond the
  unrelated repo baseline
- [x] leave packet teardown pending explicit user confirmation

Notes:
- Phase 16 closes the packet from a local runtime perspective. The new
  `scripts/ambient_bot_server_pgmem.mjs` and
  `scripts/ambient_bot_admin_smoke_pgmem.mjs` keep the real HTTP and admin
  control surfaces under test even on a workstation without local Postgres.
- The local smoke run exercised the full admin control path: status, admin
  login, combined diagnostics, planner config echo, runtime pause, logout-all,
  and runtime-control restore. Result: 7 passed, 0 warnings, 0 failed.
- Validation run:
  - `node --check scripts/ambient_bot_pgmem_support.mjs`
  - `node --check scripts/ambient_bot_server_pgmem.mjs`
  - `node --check scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- `docs/ambient-player-bots/` remains in place until the user explicitly asks
  to remove the planning packet.

## Continuation 01 checklist

- [x] add a data-driven solo quest-route registry
- [x] extend early progression beyond `q_wolves` through the Eastbrook kill
  chain
- [x] keep quest-specific hunting focused on the required mob unless the route
  explicitly allows any-hostile fallback
- [x] add focused brain regressions for accept, turn-in, and route-discipline
  cases
- [x] validate the continuation slice

Notes:
- This slice reopens the packet after the original Phase 16 checkpoint because
  the broader user goal is not "local smoke is green", it is "bots can keep
  really playing". The coordinator, real runner, social shell, LLM overlay, and
  operator controls already exist. This continuation deepens the missing
  long-horizon progression layer.
- The progression brain now covers these Eastbrook solo kill quests:
  `q_wolves`, `q_boars`, `q_spiders`, `q_murlocs`, `q_mine`, `q_greyjaw`,
  `q_bandits`, and `q_ringleader`.
- Real `pg-mem` verification against the full HTTP plus WebSocket path exposed a
  separate live blocker while closing this slice: generated ambient account
  usernames could exceed the real `/api/register` length limit. That follow-up
  is now fixed in `server/ambient_bots/naming.ts`, covered by a dedicated
  naming test, and the same live check now observes a real bot session with
  objective `accept_wolves` after a human player logs in.
- Object and collection routes such as `q_supplies`, Brother Aldric's chapel
  and graveyard chain, restocking buys, and higher-zone travel remain the next
  progression gaps.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - live `pg-mem` server check: register a human, authenticate over `/ws`, then
    confirm admin diagnostics reports a real ambient bot session with objective
    `accept_wolves`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 01 QA is now the next target, followed by object-interaction
  support in Continuation 02.

## Continuation 02 checklist

- [x] extend progression routes to include collect-object quest objectives
- [x] add object-targeting and interact behavior to the ambient bot brain
- [x] support `q_supplies` plus the first Brother Aldric collect-chain steps
- [x] add focused brain and runtime regressions for object routes
- [x] validate the continuation slice

Notes:
- This slice reuses the real player path instead of inventing a privileged
  object-pickup shortcut. Ambient bots still work through normal target plus
  interact commands, with the sim handling quest-object pickup authority.
- The progression route registry now covers collect-object goals for
  `q_supplies`, `q_whispers`, and `q_names_of_the_dead`, and kill-route support
  now extends through `q_bones` and `q_silence_the_call` so the first Aldric
  chain can keep moving.
- The brain now understands lootable ground objects from live snapshots, can
  path between their known spawn points, and will target plus interact when one
  comes into range.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - live `pg-mem` server regression: register a human, authenticate over `/ws`,
    then confirm admin diagnostics still reports a real ambient bot session and
    live objective after login
- Continuation 02 QA is now the next target. The next implementation gap after
  that is mixed drop-plus-kill routing such as `q_rite`, plus supply and
  restocking behaviors for longer autonomous runs.

## Continuation 03 checklist

- [x] add route-level sub-objective gating for multi-source collection quests
- [x] support `q_rite` progression across tunnel-rat and restless-bones drops
- [x] give `q_rite` sub-routes distinct live objective ids for clean handoff
- [x] add focused brain regressions for accept order and mixed-source routing
- [x] validate the continuation slice

Notes:
- This slice keeps the brain reconstructible from live quest-log counts instead
  of adding hidden progression memory. The new gating looks only at route order,
  quest objective indexes, and the current snapshot counts.
- `q_rite` now advances in two live stages: tunnel rats for Blessed Tallow,
  then restless bones for Ghostly Essence, before the usual Aldric turn-in.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 03 QA is now the next target. The next implementation gap after
  that is town resupply, consumable buying, and longer autonomous travel beyond
  the current Eastbrook route ladder.

## Continuation 04 checklist

- [x] add snapshot-driven town resupply objectives for food and drink
- [x] route low-supply bots through Trader Wilkes over the real vendor buy path
- [x] combine junk selling and restocking in one vendor stop
- [x] add focused brain and runtime regressions for vendor restocking
- [x] validate the continuation slice

Notes:
- This slice keeps economy authority entirely in the real server path. The bot
  brain only decides when to walk to the vendor and which stock item to buy;
  the normal `buy` plus `sell_all_junk` commands still do all authoritative
  money and inventory mutation.
- Resupply stays reconstructible from live snapshot state. The new objective
  looks only at inventory counts, copper, resource type, quest state, and
  nearby vendor presence.
- The local pg-mem harness now strips one unsupported username-regex predicate
  from the suspicious-registration helper query, so the admin smoke ends cleanly
  without a false-error tail after the summary.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node --check scripts/ambient_bot_pgmem_support.mjs`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 04 QA is now complete. The next implementation gap after that
  is longer autonomous travel and higher-zone route ladders beyond the current
  Eastbrook town loop.

## Continuation 04 QA checklist

- [x] audit Continuation 04 against
  `continuation-04-qa-town-resupply-and-consumables.md`
- [x] confirm NPC accept or turn-in flow still takes precedence over restock
  when the bot is already at a quest giver
- [x] confirm junk sell before buy behavior and vendor command payloads stay
  correct
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 04 slice. The existing
  brain regressions for ready turn-in, nearby quest pickup, junk-first vending,
  and real vendor buy commands still hold after the Fenbridge extension.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- Continuation 05 is now the next implementation target: cross-zone Fenbridge
  progression.

## Continuation 05 checklist

- [x] add distinct turn-in NPC support for cross-zone handoff routes
- [x] extend the progression registry through the Fenbridge starter ladder
- [x] add focused brain regressions for the Aldric to Fenwick handoff and first
  Zone 2 route steps
- [x] add a runtime regression for cross-zone movement input over the real `/ws`
- [x] validate the continuation slice

Notes:
- This slice extends the data-driven ladder into Mirefen Marsh without changing
  authoritative gameplay rules. Bots still quest, move, interact, and fight
  only through the normal server and sim path.
- The progression brain now covers the first Fenbridge handoff and starter Zone
  2 route ladder through `q_deepfen_purge`: `q_fenbridge_muster`,
  `q_prowlers`, `q_prowler_pelts`, `q_fen_supplies`, `q_deepfen`, `q_idols`,
  and `q_deepfen_purge`.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 05 QA is now complete. The next implementation gap after that
  was the deeper Mirefen ladder such as widows, drowned, and zone-aware
  north-town sustain.

## Continuation 05 QA checklist

- [x] audit Continuation 05 against
  `continuation-05-qa-cross-zone-fenbridge-progression.md`
- [x] confirm distinct turn-in NPC support only changes routes that opt into it
- [x] confirm the Fenbridge handoff still works through real movement, object
  interaction, and turn-in flow
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 05 slice. The
  Fenbridge handoff, cross-zone movement objective, and starter Zone 2 route
  ladder all held under the targeted validation matrix.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- Continuation 06 is now the next implementation target: Mirefen side chains
  plus Fenbridge-local sustain.

## Continuation 06 checklist

- [x] extend the progression registry through the widow and drowned solo chains
- [x] switch north-zone junk vending and food or drink restocking to
  Provisioner Hale
- [x] add focused brain regressions for Fenbridge resupply and the new Mirefen
  route ladder
- [x] add a runtime regression for Fenbridge vendor buys over the real `/ws`
- [x] validate the continuation slice

Notes:
- This slice keeps the real ambient-bot loop moving through Mirefen without
  introducing new authority shortcuts. Widow kills, drowned chapel collection,
  and Fenbridge resupply all still flow through the normal server and sim path.
- The progression brain now covers these additional Zone 2 solo routes:
  `q_widows`, `q_drowned`, `q_drowned_censers`, and `q_no_rest`.
- Mirefen sustain is now local: bots operating in the north marsh use
  `Provisioner Hale` for junk sales and food or drink restocking instead of
  walking back to Trader Wilkes.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 06 QA is now complete. The next implementation gap after that
  was the troll, cultist, and later Bastion approach ladder.

## Continuation 06 QA checklist

- [x] audit Continuation 06 against
  `continuation-06-qa-mirefen-side-chains-and-fenbridge-resupply.md`
- [x] confirm north-zone vendor selection stays local to Mirefen without
  breaking Eastbrook restock flow
- [x] confirm the widow and drowned ladders stay reconstructible from live
  quest counts and object interaction only
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 06 slice. Fenbridge
  vendor selection stayed local to Mirefen, and the earlier Eastbrook vendor
  path remained intact under the targeted regression suite.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- Continuation 07 is now the next implementation target: Broodmother, trolls,
  Grubjaw, and the first cult-camp outdoor ladder.

## Continuation 07 checklist

- [x] extend the progression registry through the Broodmother, troll, Grubjaw,
  and first cult-camp outdoor routes
- [x] preserve natural Mirefen route order so the Broodmother follow-up lands
  before the drowned-chain successor routes
- [x] add focused brain regressions for the Broodmother handoff, troll chain,
  Grubjaw pickup, and cult-camp assault
- [x] validate the continuation slice

Notes:
- This slice keeps the progression brain entirely in the existing route-driven
  model. The Broodmother follow-up now uses the same multi-objective gating
  pattern as earlier mixed quest ladders, without adding hidden progression
  memory.
- The progression brain now covers these additional Mirefen outdoor routes:
  `q_broodmother`, `q_trolls`, `q_troll_fetishes`, `q_grubjaw`, and
  `q_cult_camp`.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 07 QA is now complete. Continuation 08 extended the route ladder
  through `q_summoners`, `q_deacon`, and `q_bastion_door`, so its QA pass is
  the next target.

## Continuation 07 QA checklist

- [x] audit Continuation 07 against
  `continuation-07-qa-mirefen-troll-and-cultist-outdoors.md`
- [x] confirm the Broodmother phase boundary still switches on live quest
  counts only
- [x] confirm Mirefen route order still keeps Grubjaw before the cult-camp
  pickup and preserves earlier follow-ups
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 07 slice. The
  Broodmother handoff, troll chain, Grubjaw pickup, and cult-camp assault all
  held under the targeted validation matrix.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- Continuation 08 is now the next implementation target: cult summoners,
  Deacon Voss, and the Bastion ward-stone approach.

## Continuation 08 checklist

- [x] extend the progression registry through `q_summoners`, `q_deacon`, and
  `q_bastion_door`
- [x] add bounded multi-source cipher routing so the `q_summoners` collect
  stage can use summoners first and menders as a valid fallback
- [x] add focused brain regressions for summoner pickup, cipher-stage handoff,
  Deacon Voss, and Bastion ward-stone collection
- [x] validate the continuation slice

Notes:
- This slice keeps the progression brain in the existing route-driven model.
  The only new routing capability is a bounded primary-plus-fallback mob list
  for a kill route, still reconstructed entirely from live quest counts and
  nearby entities.
- The progression brain now covers these additional Mirefen outdoor routes:
  `q_summoners`, `q_deacon`, and `q_bastion_door`.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 08 QA is now complete. The next implementation gap after that
  is Bastion group content such as `q_olen` and `q_mistcaller`.

## Continuation 08 QA checklist

- [x] audit Continuation 08 against
  `continuation-08-qa-cult-summoners-deacon-and-bastion-approach.md`
- [x] confirm the `q_summoners` cipher stage stays bounded to valid drop
  sources and does not drift onto nearby cultists
- [x] confirm the summoner, Deacon, and Bastion approach ladder still follows
  the live quest-count handoff only
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 08 slice, but it did
  close one worthwhile coverage gap: the cipher stage now has a direct
  regression that proves nearby non-dropping cultists are ignored while the bot
  keeps routing toward valid cipher sources.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- The next implementation gap is Bastion group content such as `q_olen` and
  `q_mistcaller`.

## Continuation 09 checklist

- [x] extend the progression registry through `q_olen` and `q_mistcaller`
- [x] add data-driven dungeon-route support for Bastion entry, in-instance boss
  routing, and dungeon exit
- [x] add a focused runtime group bridge for ambient `pinvite`, `paccept`, and
  `enter_dungeon`
- [x] add focused brain and runtime regressions for Bastion accept order, party
  formation, dungeon entry, Olen-first routing, and dungeon exit
- [x] validate the continuation slice

Notes:
- This slice keeps Bastion group play on the same real server path as human
  players. Ambient bots invite, accept, and enter the dungeon only through the
  normal live command surface.
- The progression brain now covers the Zone 2 ladder through `q_olen` and
  `q_mistcaller`, including the Bastion entry and exit handoff around those
  dungeon boss quests.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 09 QA closed cleanly. The next implementation gap after this
  slice is the deeper Bastion in-dungeon combat polish or the Zone 3 handoff,
  depending on which player experience we want to prioritize next.

## Continuation 09 QA checklist

- [x] audit Continuation 09 against
  `continuation-09-qa-bastion-party-and-dungeon-bridge.md`
- [x] confirm Bastion accept order still picks up `q_mistcaller` before the
  party heads underground
- [x] confirm nearby same-cluster ambient bots use real `pinvite`, `paccept`,
  and `enter_dungeon` commands only
- [x] confirm Olen remains first, `q_olen` turn-in is deferred while
  `q_mistcaller` is still active, and the dungeon exit handoff stays clean
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new logic bug in the Continuation 09 slice. The focused
  Bastion regressions now cover the new assignment-to-cluster handoff in the
  runtime, the real party-command bridge, Bastion entry, Olen-first routing,
  and the dungeon-exit return path.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    above)
- The next implementation gap is the deeper Bastion combat polish inside the
  dungeon or the Zone 3 handoff beyond Mirefen, depending on which player
  experience we want to prioritize next.

## Continuation 10 checklist

- [x] add a bounded in-dungeon regroup layer for Sunken Bastion parties
- [x] add follower-side real `/follow <leader>` reattachment through chat
- [x] suppress leader drift or clean pulls while the Bastion party is split
- [x] add focused group and runtime regressions for regroup and follower
  reattachment
- [x] validate the continuation slice

Notes:
- This slice stays tightly scoped to Sunken Bastion cohesion. It does not try
  to become a general raid AI or multi-dungeon follower framework.
- Followers now use the normal `/follow <leader>` chat path when they trail the
  ambient Bastion leader inside the dungeon, and the group layer pauses the
  leader's brain drive while another ambient party member is visibly lagging.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red at the existing repo baseline, including the
    previously known `server/ai/active_triggers.ts`, `server/game.ts`,
    `src/ui/hud.ts`, generated i18n locale and resolved files, and
    `tests/auto_loot.test.ts` issues)
- Continuation 10 QA is now the next target.

## Continuation 10 QA checklist

- [x] audit Continuation 10 against
  `continuation-10-qa-bastion-in-dungeon-cohesion.md`
- [x] confirm followers only use the normal `/follow <leader>` chat path
- [x] confirm leader regroup holds prevent forward drift or clean pulls while
  the group is visibly split
- [x] verify focused ambient-bot validation, `build:server`, and local pg-mem
  smoke stay green

Notes:
- QA did not uncover a new blocking or should-fix issue in the Continuation 10
  slice. The new pure group test and runtime regroup test cover the intended
  follower reattachment and leader hold behavior directly.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in the Continuation 10 implementation notes)
- The next implementation target is the Zone 3 handoff beyond Mirefen, unless a
  future live-realm smoke reveals a deeper Bastion encounter-completion issue.

## Continuation 11 checklist

- [x] extend the progression registry through `q_highwatch_summons`,
  `q_stalkers`, `q_stalker_pelts`, `q_kobold_tunnels`, and `q_glowing_wax`
- [x] preserve the intended starter overlap for the ridge stalker pair without
  overlapping the kobold pair
- [x] switch Thornpeak-local food and drink restocking to Quartermaster Bree
- [x] add focused brain and runtime regressions for the Highwatch handoff,
  starter overlap, and local vendor buy path
- [x] validate the continuation slice

Notes:
- This slice extends the real progression ladder into Zone 3 without adding
  hidden progression memory or privileged authority paths. Ambient bots still
  accept quests, travel, turn in, hunt, loot, and vendor only through the
  normal live server surfaces.
- The progression brain now covers the Highwatch handoff and first Thornpeak
  starter ladder through `q_glowing_wax`.
- The ridge starter pair intentionally overlaps, but the kobold pair
  intentionally does not, because `requiresQuest` in the sim means the
  prerequisite quest must be turned in, not merely active.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 11 QA is now complete. The next implementation gap after this
  slice is the mid-Thornpeak outdoor warfront, starting with the ogre foothills
  and Stormcrag elementals before the later grouped ogre camp and Sanctum work.

## Continuation 11 QA checklist

- [x] audit Continuation 11 against
  `continuation-11-qa-highwatch-handoff-and-thornpeak-starters.md`
- [x] confirm the Highwatch handoff still uses the normal Brother Aldric to
  world-object to Captain Thessaly quest flow
- [x] confirm the ridge starter pair overlaps while the kobold pair stays
  sequential because `requiresQuest` means turned in, not merely active
- [x] confirm Thornpeak bots restock from Quartermaster Bree and stay on a
  local fallback grind path when the next quest gate is level-bound
- [x] verify focused ambient-bot validation, `build:server`, local pg-mem
  smoke, and the existing `tsc` baseline stay stable

Notes:
- QA did not uncover a new blocking or should-fix issue in the Continuation 11
  slice. The new brain and runtime regressions directly cover the Highwatch
  handoff, the allowed ridge overlap, the disallowed kobold overlap, and the
  Highwatch-local vendor buy path.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in the Continuation 11 implementation notes)
- The next implementation gap is the mid-Thornpeak outdoor warfront: ogre
  foothills and Stormcrag elementals before the later grouped ogre camp and
  Sanctum ladders.

## Continuation 12 checklist

- [x] extend the progression registry through `q_ogre_edges`,
  `q_ogre_totems`, `q_ogre_bounty`, `q_elementals`, `q_shard_cores`, and
  `q_kazzix`
- [x] add Stormcrag overlap handling so `q_shard_cores` picks up `q_kazzix`
  before leaving Highwatch and defers turn-in while Kazzix is still active
- [x] push Thornpeak-local fallback grinding forward into ogres and Stormcrag
  elementals
- [x] add focused brain and runtime regressions for ogre totems, Kazzix
  pickup or hunt flow, and mid-zone fallback selection
- [x] validate the continuation slice

Notes:
- This slice extends the real progression ladder through the mid-Thornpeak
  outdoor warfront without introducing hidden progression memory or privileged
  authority paths. Ambient bots still accept quests, travel, turn in, fight,
  loot, and vendor only through the normal live server surfaces.
- The progression brain now covers the Zone 3 outdoor ladders through
  `q_kazzix`.
- The Stormcrag pair intentionally keeps `q_shard_cores` and `q_kazzix` local
  to one outing: at level 17 the bot picks up Kazzix before leaving Highwatch,
  and if the shard-core turn-in becomes ready it is deferred while Kazzix is
  still active.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
- `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 12 QA is now complete. The next implementation gap after this
  slice is the late-Thornpeak solo outdoor ladder around Wyrmcult camps and the
  revenant fields, before the Sanctum-approach sigils and later grouped or
  boss content.

## Continuation 12 QA checklist

- [x] audit Continuation 12 against
  `continuation-12-qa-thornpeak-warfront-and-elemental-outdoors.md`
- [x] confirm the ogre foothills chain keeps the intended kill to collect to
  kill order
- [x] confirm the Stormcrag pair picks up Kazzix before leaving Highwatch and
  defers shard-core turn-in while Kazzix is still active
- [x] confirm Thornpeak bots stay on local ogre or Stormcrag fallback routes
  when the next quest gate is level-bound
- [x] verify focused ambient-bot validation, `build:server`, local pg-mem
  smoke, and the existing `tsc` baseline stay stable

Notes:
- QA did not uncover a new blocking or should-fix issue in the Continuation 12
  slice. The new brain and runtime regressions directly cover ogre totems, the
  Kazzix accept or defer flow, and the Stormcrag fallback grind path.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in the Continuation 12 implementation notes)
- The next implementation gap is the late-Thornpeak solo outdoor ladder:
  Wyrmcult camps and the revenant fields before the Sanctum-approach sigils and
  later grouped or boss content.

## Continuation 13 checklist

- [x] extend the progression registry through `q_zealots`, `q_cult_orders`,
  `q_necromancers`, `q_revenants`, and `q_revenant_vanguard`
- [x] keep the mixed Wyrmcult kill or collect objectives bounded to zealot and
  necromancer hunt routes on the correct mob families
- [x] add focused brain and runtime regressions for cult-route order, mixed
  cult hunts, and the revenant-field handoff
- [x] validate the continuation slice

Notes:
- This slice extends the real progression ladder through the late-Thornpeak
  solo outdoor chains without adding hidden progression memory or any new party
  or authority shortcuts. Ambient bots still accept quests, travel, turn in,
  fight, and loot only through the normal live server surfaces.
- The progression brain now covers the late Zone 3 solo outdoor ladders through
  `q_revenant_vanguard`.
- The Wyrmcult mixed-objective quests intentionally stay on bounded kill routes:
  zealots serve both kill and order recovery, and necromancers serve both kill
  and phylactery recovery, so the bot can reconstruct progress from live quest
  state and the correct mob family without route-local memory.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
- `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 13 QA is now complete. The next implementation gap after this
  slice is the Sanctum-approach outdoor prep ladder: sigils, blessed embers,
  the mixed `q_voice_below` congregation cleanup, and the gate-key shards
  before later grouped or boss content.

## Continuation 13 QA checklist

- [x] audit Continuation 13 against
  `continuation-13-qa-thornpeak-cultists-and-revenants.md`
- [x] confirm the Wyrmcult chain keeps the intended order across zealots,
  orders, and necromancers
- [x] confirm the mixed cult kill or collect routes stay bounded to zealot and
  necromancer hunt sources only
- [x] confirm the revenant fields chain keeps the intended order across
  `q_revenants` and `q_revenant_vanguard`
- [x] verify focused ambient-bot validation, `build:server`, local pg-mem
  smoke, and the existing `tsc` baseline stay stable

Notes:
- QA did not uncover a new blocking or should-fix issue in the Continuation 13
  slice. The new brain and runtime regressions directly cover cult-route order,
  bounded mixed cult hunts, and the revenant vanguard handoff.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in the Continuation 13 implementation notes)
- The next implementation gap is the Sanctum-approach outdoor prep ladder:
  sigils, blessed embers, the congregation cleanup, and the gate-key shards
  before later grouped or boss content.

## Continuation 14 checklist

- [x] extend the progression registry through `q_wyrm_sigils`,
  `q_breaking_the_seal`, `q_voice_below`, and `q_sanctum_gate`
- [x] keep the mixed `q_voice_below` kill objectives bounded to zealot and
  necromancer hunt routes with objective-index handoff
- [x] add focused brain and runtime regressions for sigils, embers,
  congregation cleanup, and Sanctum key shards
- [x] validate the continuation slice

Notes:
- This slice extends the real progression ladder through the final Thornpeak
  outdoor prep chains without adding hidden progression memory or any new party
  or authority shortcuts. Ambient bots still accept quests, travel, turn in,
  fight, loot, and interact with world objects only through the normal live
  server surfaces.
- The progression brain now covers the Zone 3 outdoor ladder through
  `q_sanctum_gate`.
- The mixed `q_voice_below` quest intentionally uses two bounded kill routes so
  the bot clears zealots first, then switches to necromancers once the first
  objective is complete, all reconstructed from live quest counts alone.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
- `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 16 QA is now the next target.

## Continuation 14 QA checklist

- [x] audit Continuation 14 against
  `continuation-14-qa-thornpeak-sanctum-approach.md`
- [x] confirm the Sanctum-approach chain keeps the intended order across
  `q_wyrm_sigils`, `q_breaking_the_seal`, `q_voice_below`, and
  `q_sanctum_gate`
- [x] confirm the mixed `q_voice_below` kill routes stay bounded to zealot and
  necromancer sources only
- [x] confirm the sigil and gate-key routes stay bounded to the intended
  ground-object sources
- [x] verify focused ambient-bot validation, `build:server`, local pg-mem
  smoke, and the existing `tsc` baseline stay stable

Notes:
- QA did not uncover a new blocking or should-fix issue in the Continuation 14
  slice. The existing route and runtime regressions already cover the intended
  sigil, ember, congregation, and gate-key ladders directly.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline listed
    in the Continuation 14 implementation notes)
- The next implementation gap is grouped outdoor Thornpeak progression:
  general party assembly for non-dungeon objectives, then the ogre war-camp
  crushers and Drogmar before later grouped Sanctum bosses.

## Continuation 15 checklist

- [x] generalize group coordination beyond dungeon-only objective matching and
  entry flow
- [x] extend the progression registry through `q_crushers` and `q_drogmar`
- [x] add focused group, brain, and runtime regressions for outdoor grouped
  invite, regroup, and war-camp routing
- [x] validate the continuation slice

Notes:
- This slice generalizes grouped objective coordination beyond dungeon-only
  matching while preserving the existing Bastion party and door-entry flow.
  Outdoor grouped objectives now match nearby same-cluster ambient bots on the
  same live quest instead of treating all outdoor objectives as one pool.
- The progression brain now covers the grouped Thornpeak ogre war-camp chain
  through `q_crushers` and `q_drogmar` after the solo Sanctum-gate prep ladder.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 15 QA should next confirm that outdoor grouped matching stays
  bounded to the same live quest and that the new ogre war-camp slice adds no
  regressions to the Bastion dungeon flow before the later `q_korgath` and
  Sanctum boss work.

## Continuation 15 QA checklist

- [x] audit Continuation 15 against
  `continuation-15-qa-thornpeak-ogre-war-camp-groups.md`
- [x] confirm outdoor grouped coordination matches same-cluster ambient bots on
  the same grouped quest instead of broad same-cluster outdoor objectives
- [x] confirm the grouped Thornpeak order keeps `q_crushers` ahead of
  `q_drogmar` and does not skip straight to later solo chains
- [x] confirm outdoor invite, accept, regroup, and follower reattachment stay
  on the normal live party and chat command path
- [x] verify focused ambient-bot validation, `build:server`, local pg-mem
  smoke, and the existing `tsc` baseline stay stable

Notes:
- QA did not uncover a new blocking logic bug in the Continuation 15 slice, but
  it did close one worthwhile regression gap: the group test suite now proves a
  same-cluster bot on `q_drogmar` is not treated as a `q_crushers` party
  candidate just because it is nearby.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- The next implementation gap is the later grouped Thornpeak threshold boss
  work, starting with `q_korgath`, before deeper Sanctum boss content.

## Continuation 16 checklist

- [x] extend the progression registry through `q_korgath`
- [x] reuse the live grouped and dungeon-entry bridge for Gravewyrm Sanctum
  entry, in-instance Korgath pursuit, and dungeon exit
- [x] add focused brain and runtime regressions for accept order, Sanctum
  entry, Korgath routing, and exit behavior
- [x] validate the continuation slice

Notes:
- This slice extends the real progression ladder into the first Gravewyrm
  Sanctum bridge without adding a privileged dungeon shortcut. Ambient bots
  still group, travel, enter the instance, fight Korgath, leave, and turn in
  only through the normal live quest, party, and dungeon command surfaces.
- The progression brain now covers grouped Thornpeak progression through
  `q_korgath`.
- Validation run:
  - `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts`
  - `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
  - `npm run build:server`
  - `node scripts/ambient_bot_admin_smoke_pgmem.mjs`
  - `npx tsc --noEmit` (still red only at the unrelated repo baseline, which
    currently includes existing issues in `server/ai/active_triggers.ts`,
    `server/game.ts`, `src/ui/hud.ts`, generated i18n locale and resolved files
    under `src/ui/i18n.locales/` and `src/ui/i18n.resolved.generated/`, and
    `tests/auto_loot.test.ts`)
- Continuation 16 QA should next confirm the Gravewyrm Sanctum bridge adds no
  regressions to the earlier Bastion flow and correctly hands off the next
  deeper Sanctum boss gap after Korgath.

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

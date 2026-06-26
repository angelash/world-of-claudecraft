# Implementation Plan: Ambient Player Bots

This packet builds the ambient player bot system in thin, reviewable slices.
Every implementation phase is followed immediately by a QA phase. The original
phase ladder reached a local release-readiness checkpoint at Phase 16.
Post-packet continuation slices now carry the longer-horizon progression goal
forward.

## Canonical workflow

Step 0, pre-flight:
- run `git status --short`
- keep unrelated work untouched
- confirm the current phase and locked decisions in `state.md`

Step 1, load context:
- read only the files relevant to the current slice
- prefer focused discovery and existing seams over large-file wandering

Step 2, implement the smallest complete slice:
- new code should land in focused modules
- keep `server/game.ts` changes limited to named integration points
- keep `src/sim/` deterministic and authority-safe

Step 3, validate and review:
- run the narrowest meaningful validation set from `state.md`
- add or update tests with each phase

Step 4, update docs and commit:
- update `progress.md`
- update `state.md` with any locked additions
- commit with explicit paths only

## Phase ladder

| Phase | Type | Title | Main outcome |
|---|---|---|---|
| 1 | impl | Foundation, registry, planner, config, diagnostics | server-side ambient coordinator skeleton and persistence shape |
| 2 | QA | Verify Phase 1 | correctness, tests, dead code, schema safety |
| 3 | impl | Real-server runner and provisioning | headless bot runtime that registers, creates characters, logs in, and reconnects |
| 4 | QA | Verify Phase 3 | login flow, session safety, retry logic, real-wire coverage |
| 5 | impl | Progression brain v1 | low-cost quest, travel, combat, vendor, recovery loop for early game |
| 6 | QA | Verify Phase 5 | progression stability, route safety, no stuck loops |
| 7 | impl | Human-cluster orchestration | live ambient assignment around nearby players, replacement, drift, logout |
| 8 | QA | Verify Phase 7 | population feel, hysteresis, load-shedding behavior |
| 9 | impl | Social shell and bot identity memory | friends, whispers, relationship state, moderation compliance |
| 10 | QA | Verify Phase 9 | social correctness, ignore/block handling, safety |
| 11 | impl | LLM social and plan integration | bounded JSON planning, chat generation, caching, audit, budget |
| 12 | QA | Verify Phase 11 | validator coverage, provider fallback, hallucination guardrails |
| 13 | impl | Admin, telemetry, and incident controls | diagnostics surfaces, kill switches, queue control, rollout levers |
| 14 | QA | Verify Phase 13 | operator workflows, runtime visibility, fail-safe behavior |
| 15 | impl | Live readiness and smoke automation | end-to-end scripts, staging checklist, rollout plan |
| 16 | QA | Final QA and teardown offer | full-stack gate, packet cleanup decision |

## Post-packet continuation ladder

| Continuation | Type | Title | Main outcome |
|---|---|---|---|
| 01 | impl | Expanded solo progression | route-driven Eastbrook kill-quest chain beyond `q_wolves` |
| 01 QA | QA | Verify continuation 01 | route order, hunt discipline, test coverage |
| 02 | impl | Object interaction progression | collection, pickup, and interact quest support |
| 02 QA | QA | Verify continuation 02 | object-route correctness, no regressions in kill routes |

## Phase details

### Phase 1, Foundation

Deliverables:
- persistent registry schema for ambient bot identities
- pure planner service that groups humans into clusters and emits login, logout,
  and provision intents
- runtime config parsing and experiment flag
- `GameServer` integration seam and diagnostics snapshot
- tests for clustering, matching, release logic, and schema wiring

Out of scope:
- actual HTTP register or WebSocket runner
- quest execution
- social chat
- LLM decisions

### Phase 3, Real-server runner and provisioning

Deliverables:
- headless client that uses `/api/register`, `/api/characters`, and `/ws`
- real snapshot merge, reconnect, and command loop
- bot provisioning worker that fulfills Phase 1 `provisionBot` and `loginBot`
  intents
- lifecycle acknowledgements back into the registry

### Phase 5, Progression brain v1

Deliverables:
- early-game objective picker
- travel and quest-route executor
- safe combat loop
- rest, vendor, and inventory hygiene
- stuck detection and reset behavior

### Phase 7, Human-cluster orchestration

Deliverables:
- live cluster assignment around human players
- drift and release behavior for bots that progress away
- replacement logic with zone and level matching
- population budgets and cooldowns

### Phase 9, Social shell and memory

Deliverables:
- friend and whisper handling shell
- relationship memory records
- block and ignore compliance
- delayed response scheduler and presence emotes

### Phase 11, LLM social and plan integration

Deliverables:
- bounded `AmbientBotPlanDecisionV1`
- bounded `AmbientBotSocialDecisionV1`
- provider, prompt, validator, audit, and cache plumbing
- budget guardrails and downgrade paths

### Phase 13, Admin and incident controls

Deliverables:
- diagnostics endpoint and later dashboard wiring
- kill switches and rollout modes
- budget, cluster, session, and failure metrics
- incident runbook support

### Phase 15, Live readiness

Deliverables:
- real-wire smoke scripts
- chaos and recovery drills
- rollout checklist and operator handoff

## Continuation details

### Continuation 01, Expanded solo progression

Deliverables:
- a quest-route registry for early solo progression
- Eastbrook kill-route coverage through `q_ringleader`
- quest-specific hunt discipline with explicit fallback rules
- focused brain regressions for new accept and turn-in paths

### Continuation 02, Object interaction progression

Deliverables:
- object and ground-item route support
- `q_supplies` collection flow
- first Brother Aldric interaction-chain support
- regressions that cover non-kill objective handling

## Current starter prompts

- `phase-01-foundation.md`
- `phase-02-qa-foundation.md`
- `phase-03-real-runner.md`
- `phase-04-qa-real-runner.md`
- `phase-05-progression-brain.md`
- `phase-06-qa-progression-brain.md`
- `phase-07-human-cluster-orchestration.md`
- `phase-08-qa-human-cluster-orchestration.md`
- `phase-09-social-shell-memory.md`
- `phase-10-qa-social-shell-memory.md`
- `phase-11-llm-social-plan-integration.md`
- `phase-12-qa-llm-social-plan-integration.md`
- `phase-13-admin-telemetry-incident-controls.md`
- `phase-14-qa-admin-telemetry-incident-controls.md`
- `phase-15-live-readiness-smoke-automation.md`
- `phase-16-final-qa-teardown.md`
- `continuation-01-expanded-solo-progression.md`
- `continuation-01-qa-expanded-solo-progression.md`
- `continuation-02-object-interaction-progression.md`
- `continuation-02-qa-object-interaction-progression.md`

# Ambient Player Bots (planning packet)

This packet defines the end-to-end ambient player bot program for the real
online server. The target feeling is simple: a real player should usually see a
small population of believable nearby adventurers who log in, move, quest,
fight, level, drift away, and get replaced naturally. Later phases add social
behavior, friends, whispers, and bounded LLM-backed conversation.

The original Phase 16 checkpoint closed the first local runtime and operator
readiness ladder. The broader "play through the game" goal is still open, so
this packet now continues with post-packet progression slices. This is still
cross-session scaffolding, not a shipping artifact.

## Index

Cross-cutting docs:
- `brainstorm.md` - product vision, reusable foundation already in the repo,
  locked architecture, LLM recommendations, risks, and open questions.
- `implementation-plan.md` - canonical workflow, phase ordering, and the full
  implementation and QA ladder.
- `state.md` - the cross-phase cheat sheet: locked decisions, invariants,
  validation matrix, planned schemas, runtime flags, and file paths.
- `progress.md` - status table plus per-phase deliverables and notes.
- `qa-checklist.md` - whole-feature integration matrix for the final gate.
- `rollout-handoff.md` - operator smoke, pause, logout-all, restore, and
  rollback notes.

Starter prompts:
- `phase-01-foundation.md` - Phase 1 implementation prompt for the server-side
  registry, planner, config, diagnostics, and schema foundation.
- `phase-02-qa-foundation.md` - Phase 1 QA prompt.
- `phase-03-real-runner.md` - Phase 3 implementation prompt for real account
  provisioning, loopback HTTP and WS bot login, and runtime lifecycle wiring.
- `phase-04-qa-real-runner.md` - Phase 3 QA prompt.
- `phase-05-progression-brain.md` - Phase 5 implementation prompt for the first
  real early-game play loop after login.
- `phase-06-qa-progression-brain.md` - Phase 5 QA prompt.
- `phase-07-human-cluster-orchestration.md` - Phase 7 implementation prompt for
  stable human-cluster continuity, bot handoff, and population load-shedding.
- `phase-08-qa-human-cluster-orchestration.md` - Phase 7 QA prompt.
- `phase-09-social-shell-memory.md` - Phase 9 implementation prompt for
  incoming whisper handling, lightweight relationship memory, and presence
  emotes.
- `phase-10-qa-social-shell-memory.md` - Phase 9 QA prompt.
- `phase-11-llm-social-plan-integration.md` - Phase 11 implementation prompt
  for bounded LLM social stance, whisper replies, audit, and fallback paths.
- `phase-12-qa-llm-social-plan-integration.md` - Phase 11 QA prompt for
  validator coverage, fallback safety, semantic cache behavior, and type
  baseline checks.
- `phase-13-admin-telemetry-incident-controls.md` - Phase 13 implementation
  prompt for operator diagnostics, live rollout levers, and emergency controls.
- `phase-14-qa-admin-telemetry-incident-controls.md` - Phase 13 QA prompt for
  operator workflows, fail-safe pauses, and logout-all behavior.
- `phase-15-live-readiness-smoke-automation.md` - Phase 15 implementation
  prompt for real-admin smoke tooling and rollout handoff docs.
- `phase-16-final-qa-teardown.md` - historical Phase 16 QA checkpoint for live
  smoke, local release gate, and the first teardown decision.

Post-packet continuation prompts:
- `continuation-01-expanded-solo-progression.md` - extend the real progression
  brain from the first wolf quest into the broader Eastbrook solo kill chain.
- `continuation-01-qa-expanded-solo-progression.md` - QA prompt for
  continuation 01.
- `continuation-02-object-interaction-progression.md` - add object, ground
  item, and non-kill quest interaction support for the next progression gap.
- `continuation-02-qa-object-interaction-progression.md` - QA prompt for
  continuation 02.
- `continuation-03-mixed-source-collection-progression.md` - add route-level
  sub-objective gating for multi-source collection quests such as `q_rite`.
- `continuation-03-qa-mixed-source-collection-progression.md` - QA prompt for
  continuation 03.

## How to use this packet

1. Read this README, then `state.md`, then `brainstorm.md`.
2. Open the next incomplete phase in `progress.md`.
3. Run that phase, validate it, update `progress.md` and `state.md`, then hand
   off immediately to its QA phase.
4. Keep the shipping code additive and authority-safe: bots may feel alive, but
   the real server remains the only authority.

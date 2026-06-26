# Ambient Player Bots (planning packet)

This packet defines the end-to-end ambient player bot program for the real
online server. The target feeling is simple: a real player should usually see a
small population of believable nearby adventurers who log in, move, quest,
fight, level, drift away, and get replaced naturally. Later phases add social
behavior, friends, whispers, and bounded LLM-backed conversation.

This is cross-session scaffolding, not a shipping artifact. The final QA phase
offers to delete this directory before the PR.

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

## How to use this packet

1. Read this README, then `state.md`, then `brainstorm.md`.
2. Open the next incomplete phase in `progress.md`.
3. Run that phase, validate it, update `progress.md` and `state.md`, then hand
   off immediately to its QA phase.
4. Keep the shipping code additive and authority-safe: bots may feel alive, but
   the real server remains the only authority.

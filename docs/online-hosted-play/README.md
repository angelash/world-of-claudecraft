# Online Hosted Play (planning packet)

This packet defines online hosted play for real player characters. The target
experience is simple: while a real character is online, the player can turn on
hosted play, watch the character continue to quest and grind through the real
authoritative server path, interrupt it at any time with manual input, and
later extend that same foundation into party, social, and LLM-assisted
behaviors.

This packet is separate from `docs/ambient-player-bots/`. Ambient population
bots solve "make the world look inhabited". Hosted play solves "let one real
player hand their current live character to automation safely". They can share
automation logic, but they do not share lifecycle orchestration.

## Index

Cross-cutting docs:
- `requirements.md` - product, UX, safety, and functional requirements for
  hosted play.
- `architecture.md` - same-session architecture, authority boundaries, and
  runtime flow.
- `brainstorm.md` - current repo fit, reusable systems, risks, and later LLM
  opportunities.
- `implementation-plan.md` - phase ladder and development workflow.
- `progress.md` - current status table, per-phase checklists, and notes.
- `state.md` - locked decisions, validation matrix, file paths, and planned
  API and UI surfaces.
- `qa-checklist.md` - whole-feature integration gate.

Phase docs:
- `phase-01-same-session-foundation.md` - Phase 1 implementation prompt for
  same-session hosted play, player controls, and the first online brain bridge.
- `phase-02-qa-same-session-foundation.md` - Phase 1 QA prompt.
- `phase-03-persistence-and-party.md` - Phase 3 implementation prompt for
  persisted preferences, login resume, and grouped hosted play.
- `phase-04-qa-persistence-and-party.md` - Phase 3 QA prompt.
- `phase-05-social-and-llm.md` - Phase 5 implementation prompt for bounded
  social and LLM overlays.
- `phase-06-final-qa-teardown.md` - final QA prompt and teardown decision.

## How to use this packet

1. Read `requirements.md`, `architecture.md`, and `state.md`.
2. Check the next incomplete phase in `progress.md`.
3. Implement one phase at a time, validate it, update `progress.md` and
   `state.md`, then commit only that phase's files.
4. Keep the real server authoritative. Hosted play may automate inputs, but it
   never gets privileged sim mutation paths.

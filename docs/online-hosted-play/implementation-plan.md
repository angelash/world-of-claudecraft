# Implementation Plan: Online Hosted Play

This packet builds hosted play in thin slices. Each implementation phase should
end in a green validation pass, a doc update, and a focused commit.

## Canonical workflow

Step 0, pre-flight:
- run `git status --short`
- preserve unrelated work
- confirm locked decisions in `state.md`

Step 1, load context:
- read only the files relevant to the current slice
- prefer existing seams over new framework-like abstractions

Step 2, implement the smallest complete slice:
- keep `server/game.ts` changes to named hosted-play seams
- keep the hosted runtime in dedicated modules
- keep the client UI additive inside existing options patterns

Step 3, validate:
- run the smallest meaningful command set from `state.md`
- add or update tests for every new runtime or API path

Step 4, update docs and commit:
- update `progress.md`
- update `state.md`
- commit explicit paths only

## Phase ladder

| Phase | Type | Title | Main outcome |
|---|---|---|---|
| 1 | impl | Same-session foundation | owner API, hosted runtime, manual-pause rules, game-menu controls, first live automation loop |
| 2 | QA | Verify Phase 1 | correctness, pause safety, UI clarity, test coverage |
| 3 | impl | Persistence and party support | per-character preference, login resume policy, party follow or regroup |
| 4 | QA | Verify Phase 3 | migration safety, resume correctness, grouped path stability |
| 5 | impl | Social and LLM overlays | friend or whisper shell, bounded LLM reply and memory overlays |
| 6 | QA | Final QA and teardown offer | full-stack gate, rollout notes, packet cleanup decision |

## Phase details

### Phase 1, Same-session foundation

Deliverables:
- hosted runtime for live player sessions
- named `GameServer` seams for hosted status, live-state reads, and action
  application
- owner-only REST API to fetch status and enable or disable hosted play
- in-game game-menu control surface
- first online automation bridge that reuses the ambient progression brain
- manual-input pause and stale-movement clearing

Out of scope:
- DB persistence
- login auto-resume
- party support
- social chat automation
- LLM integration

### Phase 3, Persistence and party support

Deliverables:
- additive per-character hosted-play preference persistence
- safe enable-on-login resume policy
- reuse or adapt group coordination for party follow and regroup
- richer hosted status and reason reporting

### Phase 5, Social and LLM overlays

Deliverables:
- friend or whisper reaction shell
- bounded structured LLM overlays
- audit, cooldown, budget, and fallback behavior
- player-visible status for LLM-disabled or fallback state

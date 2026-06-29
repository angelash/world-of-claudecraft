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
- `requirements.md` - the explicit product and system requirements for the
  real-server ambient population program.
- `architecture.md` - the component model, authority boundary, and runtime
  flows for planner, runner, brain, group, social, and operator layers.
- `post-packet-archive.md` - the late packet archive for pre-combat prep,
  hosted and ambient quest stabilization, actionable-route priority, and the
  current live verification policy.
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
- `continuation-04-town-resupply-and-consumables.md` - add real vendor-based
  food and drink restocking for longer autonomous quest runs.
- `continuation-04-qa-town-resupply-and-consumables.md` - QA prompt for
  continuation 04.
- `continuation-05-cross-zone-fenbridge-progression.md` - extend the real
  progression ladder across the causeway and into the Fenbridge Zone 2 starter
  quest chain.
- `continuation-05-qa-cross-zone-fenbridge-progression.md` - QA prompt for
  continuation 05.
- `continuation-06-mirefen-side-chains-and-fenbridge-resupply.md` - extend the
  real progression ladder into the widow and drowned side chains while moving
  north-zone sustain to the Fenbridge vendor.
- `continuation-06-qa-mirefen-side-chains-and-fenbridge-resupply.md` - QA
  prompt for continuation 06.
- `continuation-07-mirefen-troll-and-cultist-outdoors.md` - extend the real
  progression ladder through the Broodmother, troll barrows, Grubjaw, and the
  first cult-camp outdoor chain.
- `continuation-07-qa-mirefen-troll-and-cultist-outdoors.md` - QA prompt for
  continuation 07.
- `continuation-08-cult-summoners-deacon-and-bastion-approach.md` - extend the
  real progression ladder through the summoner cleanup, Deacon Voss, and the
  Bastion ward-stone approach.
- `continuation-08-qa-cult-summoners-deacon-and-bastion-approach.md` - QA
  prompt for continuation 08.
- `continuation-09-bastion-party-and-dungeon-bridge.md` - add the first real
  Bastion party, dungeon-entry, Olen, and Mistcaller bridge on the live
  server path.
- `continuation-09-qa-bastion-party-and-dungeon-bridge.md` - QA prompt for
  continuation 09.
- `continuation-10-bastion-in-dungeon-cohesion.md` - harden Bastion in-dungeon
  regrouping, follower reattachment, and leader pull discipline.
- `continuation-10-qa-bastion-in-dungeon-cohesion.md` - QA prompt for
  continuation 10.
- `continuation-11-highwatch-handoff-and-thornpeak-starters.md` - extend the
  real progression ladder into Highwatch and the first Thornpeak starter loops.
- `continuation-11-qa-highwatch-handoff-and-thornpeak-starters.md` - QA prompt
  for continuation 11.
- `continuation-12-thornpeak-warfront-and-elemental-outdoors.md` - extend the
  real progression ladder through the mid-Thornpeak ogre foothills and
  Stormcrag elemental outdoor ladders.
- `continuation-12-qa-thornpeak-warfront-and-elemental-outdoors.md` - QA prompt
  for continuation 12.
- `continuation-13-thornpeak-cultists-and-revenants.md` - extend the real
  progression ladder through the late-Thornpeak Wyrmcult camps and revenant
  field outdoor ladders.
- `continuation-13-qa-thornpeak-cultists-and-revenants.md` - QA prompt for
  continuation 13.
- `continuation-14-thornpeak-sanctum-approach.md` - extend the real
  progression ladder through the Sanctum-approach prep ladders for sigils,
  embers, congregation cleanup, and gate-key shards.
- `continuation-14-qa-thornpeak-sanctum-approach.md` - QA prompt for
  continuation 14.
- `continuation-15-thornpeak-ogre-war-camp-groups.md` - extend the real
  progression ladder into the grouped Thornpeak ogre war-camp chain and
  generalize group coordination beyond dungeon-only objectives.
- `continuation-15-qa-thornpeak-ogre-war-camp-groups.md` - QA prompt for
  continuation 15.
- `continuation-16-korgath-sanctum-threshold.md` - extend the real progression
  ladder into the first Gravewyrm Sanctum boss bridge around `q_korgath`.
- `continuation-16-qa-korgath-sanctum-threshold.md` - QA prompt for
  continuation 16.
- `continuation-17-velkhar-sanctum-bridge.md` - extend the real progression
  ladder into the second Gravewyrm Sanctum boss bridge around `q_velkhar`.
- `continuation-17-qa-velkhar-sanctum-bridge.md` - QA prompt for
  continuation 17.
- `continuation-18-gravewyrm-final-boss-bridge.md` - extend the real
  progression ladder into the final Gravewyrm Sanctum boss bridge around
  `q_gravewyrm`.
- `continuation-18-qa-gravewyrm-final-boss-bridge.md` - QA prompt for
  continuation 18.

## How to use this packet

1. Read this README, then `requirements.md`, `architecture.md`,
   `post-packet-archive.md`, `state.md`, and `brainstorm.md`.
2. Open the next incomplete phase in `progress.md`.
3. Run that phase, validate it, update `progress.md` and `state.md`, then hand
   off immediately to its QA phase.
4. Keep the shipping code additive and authority-safe: bots may feel alive, but
   the real server remains the only authority.

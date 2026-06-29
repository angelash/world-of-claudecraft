# Hosted Party Autonomy Plan

This planning packet turns hosted play from a solo automation toggle into a
watchable cooperative playthrough loop. The target experience is that a player
enables hosted play, the hosted character keeps LAN/IP accessible, fills a
nearby party up to the configured target, accepts and completes every practical
quest through level 20, talks through plans and mistakes with party members,
and uses class roles, buffs, healing, tanking, and focus fire like a believable
group of real players.

## Documents

- [requirements.md](requirements.md): product requirements and acceptance
  criteria.
- [brainstorm.md](brainstorm.md): current-state analysis, reusable systems, and
  design ideas.
- [design.md](design.md): target architecture and behavior contracts.
- [implementation-plan.md](implementation-plan.md): phase table and workflow.
- [progress.md](progress.md): phase status and checklists.
- [state.md](state.md): cross-session implementation state.
- [qa-checklist.md](qa-checklist.md): final validation matrix.

## Phase Prompts

- [phase-01-party-defaults.md](phase-01-party-defaults.md): party-fill defaults
  and reliable nearby invite behavior.
- [phase-01-qa.md](phase-01-qa.md): QA for party-fill defaults.
- [phase-02-quest-intake.md](phase-02-quest-intake.md): accept all sensible
  quests and prioritize grouped risk.
- [phase-02-qa.md](phase-02-qa.md): QA for quest intake.
- [phase-03-party-chat.md](phase-03-party-chat.md): hosted party chat that
  affects tactical behavior.
- [phase-03-qa.md](phase-03-qa.md): QA for party chat and behavior coupling.
- [phase-04-support-roles.md](phase-04-support-roles.md): class support,
  healing, buffing, tanking, and focus-fire polish.
- [phase-04-qa.md](phase-04-qa.md): QA for support roles.
- [phase-05-live-harness.md](phase-05-live-harness.md): live hosted-play
  harness for LAN/IP stack verification.
- [phase-05-qa.md](phase-05-qa.md): QA for the live harness.
- [phase-06-level-20-run.md](phase-06-level-20-run.md): long-run validation to
  level 20 and pre-20 quest completion.
- [phase-06-qa.md](phase-06-qa.md): final QA and packet teardown offer.

## Locked Intent

Hosted play must feel like watching a real cooperative session, not like a bot
silently grinding. The implementation still keeps server authority, sim
determinism, moderation, and player ownership boundaries intact. The automation
may issue normal commands and movement input only. It may not mutate combat,
loot, quest, economy, or party outcomes through shortcuts.

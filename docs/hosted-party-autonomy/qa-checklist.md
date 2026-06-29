# QA Checklist: Hosted Party Autonomy

## Final Feature Matrix

- [ ] LAN/IP startup remains intact through `windows_stack.ps1`.
- [ ] Backend changes are followed by restart and live status verification.
- [ ] Hosted play defaults to cooperative party fill.
- [ ] UI exposes solo or cooperative mode, auto invite, and target party size.
- [ ] Nearby invite loop fills to the configured target and resumes after party
  size drops.
- [ ] Invite loop respects combat, death, leadership, target, range, and cooldown
  guards.
- [ ] Quest intake accepts eligible local quests before long travel.
- [ ] Quest pursuit scoring considers party strength and composition.
- [ ] Unsafe quests remain deferred until level, gear, supplies, or party strength
  make them practical.
- [ ] Party chat uses the real party channel.
- [ ] Chat includes plans, acknowledgements, praise, corrections, and recoveries.
- [ ] Chat affects behavior through validated intent, not free-form parsing.
- [ ] Buffs, healing, tanking, focus fire, regrouping, recovery, looting, vendor,
  quest accept, and quest turn-in all appear in validation.
- [ ] LLM-disabled fallback remains believable.
- [ ] No LLM output directly mutates gameplay state.
- [ ] `src/sim` imports remain pure and deterministic.
- [ ] Player-visible UI strings use `t()` keys.
- [ ] Player-visible server emits have localization matcher coverage.
- [ ] Targeted tests pass.
- [ ] `npm run build:server` passes for backend changes.
- [ ] Final long run reaches level 20 after the last code change.
- [ ] Final long run completes all practical pre-20 quests or records a concrete
  valid blocker.

## Live Artifact Requirements

The final live-run artifact should include:

- start time and end time
- stack URLs
- character name, class, start level, and final level
- final quest log and completed quests
- party size timeline
- invite attempts and accepted invites
- chat line count and sample categories
- support action counts for buffs, heals, tank actions, focus actions, and
  regroups
- deaths, stuck resets, runtime errors, and reconnects
- final verdict

## Packet Teardown

After Phase 6 QA passes, ask the user whether to remove this planning packet
before a PR or release cleanup. Do not delete it without explicit confirmation.

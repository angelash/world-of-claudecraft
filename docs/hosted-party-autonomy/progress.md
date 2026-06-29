# Progress: Hosted Party Autonomy

Current date: 2026-06-29

| Phase | Status | Started | Completed |
|---|---|---|---|
| LAN/IP rules | Complete | 2026-06-29 | 2026-06-29 |
| Planning packet | Complete | 2026-06-29 | 2026-06-29 |
| Phase 1 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 1 QA | Pending |  |  |
| Phase 2 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 2 QA | Pending |  |  |
| Phase 3 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 3 QA | Complete | 2026-06-29 | 2026-06-29 |
| Phase 4 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 4 QA | Complete | 2026-06-29 | 2026-06-29 |
| Phase 5 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 5 QA | Complete | 2026-06-29 | 2026-06-29 |
| Phase 6 | In progress | 2026-06-29 |  |
| Phase 6 QA | Pending |  |  |

## Completed

- LAN/IP helper rules were added and pushed in commit `21bb4182`.
- The Windows helper delegates to `online_lan.mjs`, preserves IP access, and is
  agent-maintainable after service unregister.
- Phase 1 changed hosted defaults to cooperative party fill, added preference
  versioning for legacy default upgrade, expanded invite guard tests, ran the
  targeted hosted and character DB suites, built the server, restarted the
  stack, and verified LAN/IP access.
- Phase 2 split quest intake from pursuit. Visible nearby quest givers can now
  be picked up before leaving for active routes, while resupply remains higher
  priority. Nearby alive party members lower safe pursuit gates by up to two
  levels, and group movement now prioritizes dungeon entry and regroup follow
  over pre-pull preparation when already assembled.
- Phase 3 added a structured party intent layer for route plans, buffs, focus,
  praise, correction, and recovery. Party chat now uses that intent for leader
  briefings and member acknowledgements, hosted party coordination consumes
  hold-advance intent without parsing chat text, and hosted debug details expose
  party role, duty, intent, target, and last party-chat action.
- Phase 4 tightened cooperative support priorities. Warrior tanks now taunt
  mobs off healers before spending the moment on defensive stance, and priests
  shield threatened, slightly wounded allies before switching to focus damage.
- Phase 5 added `scripts/hosted_play_live_harness.mjs`, a repeatable live
  Postgres-backed LAN/IP harness that creates real online clients, enables
  hosted play through REST, observes invites, party fill, chat, quests, support,
  deaths, errors, and stuck resets, and writes a JSON report under `tmp/`.
- Phase 5 live QA exposed that grouped followers could identify nearby quest
  pickup objectives but lose their local `target/interact` or short movement
  while party follow paused brain drive. The hosted runtime now lets nearby
  local accept and turn-in objectives complete before resuming follow.
- Phase 6 long-run QA reached party size 5 with quest, support, and combat
  signals, but the run exposed party-chat spam before level 20. The 151 second
  report recorded 516 party-chat events and server chat-rate lock messages.
  Party chat now paces leader briefings and selects one follower acknowledgement
  per leader call instead of making every follower repeat the same line.
- After the party-chat pacing fix, the stack was restarted through
  `scripts/windows_stack.ps1`, IP access was verified on `0.0.0.0`, and the short
  live harness passed with 15 party-chat events, no chat-rate errors, party size
  5, quest signals, support signals, and 0 hosted runtime errors.
- The next level 20 run confirmed chat stayed under control, but exposed a
  separate stuck-reset issue: followers in `follow_leader` or leaders in
  preparation pauses could have their own brain movement replaced by party
  coordination, then miscount that pause as failed pathing. The brain now records
  external party progress when group coordination pauses it without a travel
  goal, so `/follow`, regroup, and preparation waits do not inflate stuck resets.
- After that fix, the short live harness passed with party size 5, 12 party-chat
  events, no chat-rate errors, 0 hosted runtime errors, and max stuck resets 0.
- A later level 20 run showed another stall: party preparation paused movement
  while the brain was at a vendor with a restock objective, so safe vendor
  commands such as `buy` were not executed. Party-paused self-maintenance now
  allows recover, prepare, equip, sell, restock, and upgrade objectives to
  execute nearby utility commands without allowing combat routing to bypass the
  party coordinator.
- After that fix, the short live harness passed with party size 5, 23 party-chat
  events, no chat-rate errors, 0 hosted runtime errors, and max stuck resets 0.
- The next level 20 run exposed a false regroup hold at 843 seconds. The party
  was physically assembled, but the hosted leader still read stale party roster
  coordinates and stayed in `hold_regroup`. Hosted party coordination now
  refreshes dynamic party member position, combat, health, and resource fields
  from the current `self` and visible player entity snapshots before deciding
  follow, regroup, support, and assist behavior.
- After that fix, the stack was restarted, ports `5173` and `8787` were verified
  on `0.0.0.0`, LAN URLs were printed, and the short live harness passed with
  party fill, hosted invite, party chat, intent, support or combat, quest
  signals, runtime clean, and max stuck resets 0.
- A follow-up level 20 run showed that the stale roster fix worked, but an old
  `correction/regroup` party intent could keep the leader paused after the
  party had already assembled. Hosted party coordination now rechecks current
  party facts before consuming a hold-advance intent: regroup only holds when a
  member is still outside regroup range, recovery only holds while someone is
  dead or critically low, and stale prepare intent is released to the normal
  preparation logic.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, and the short live harness passed with party fill, hosted invite,
  party chat, intent, support or combat, quest signals, runtime clean, and max
  stuck resets 0.
- The next level 20 run reached level 5 and progressed further, but deaths
  occurred when a level 5 leader pulled level 4 teammates into level 6 mine
  content. Group strength no longer blindly lowers route gates by two levels:
  the bonus is capped at one level, and every nearby contributing party member
  must meet the resulting grouped safe level before the route can be pursued.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the related test suite and server build passed, and a rerun of the
  short live harness passed with party fill, hosted invite, party chat, intent,
  support or combat, quest signals, runtime clean, and max stuck resets 0.
- A later level 20 run stayed death-free through level 5, but progress stalled
  when a follower away from the leader entered `prepare_party` instead of
  closing the gap, leaving the leader in regroup hold. Non-combat preparation
  and preparation-style support now yield to leader follow whenever a follower
  is outside close-follow range.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the related test suite and server build passed, and the short live
  harness passed with party fill, hosted invite, party chat, intent, support or
  combat, quest signals, runtime clean, and max stuck resets 0.
- The next post-change level 20 run reached a full party and level 5 with no
  deaths or runtime errors, but stalled when a follower was more than the
  60-yard party action range from the leader. The leader held regroup, while the
  follower fell back to brain behavior with no leader travel path. Hosted
  followers now treat 60 yards as an action and assist range only, not a cap on
  returning to the leader.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the related test suite and server build passed, the first short
  live harness run missed the all-members quest-state gate inside 120 seconds,
  and an immediate rerun passed with party fill, hosted invite, party chat,
  intent, support or combat, quest signals, runtime clean, and max stuck resets
  within limit.
- The next level 20 run started after that commit and reached level 3, but was
  invalid because Darian stayed `disabled`, party size 1, and quest state 0
  while the other clients were already progressing. The live harness now records
  each client's current party member names, requires every client to currently
  see the target party, and can enable a nearby member without active inviting
  when the leader already appears full. This prevents a false pass when one
  client is still outside the active hosted-party loop.
- The next level 20 run reached level 3 and showed the intent release fix
  working, but a distant follower could remain in `follow_leader` without
  closing the gap after `/follow` stopped pulling them. Non-combat hosted
  follow now adds a travel goal toward the leader whenever the follower is
  outside the close-follow range, including while the `/follow` chat command is
  on cooldown.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, and the short live harness passed with party fill, hosted invite,
  party chat, intent, support or combat, quest signals, runtime clean, and max
  stuck resets 0.

## Planning Packet Checklist

- [x] Capture user requirements.
- [x] Record current-state gap analysis.
- [x] Define target design.
- [x] Define phase plan.
- [x] Define validation matrix.
- [x] Prepare planning docs for commit and push.

## Phase 1 Checklist

- [x] Cooperative hosted defaults are applied.
- [x] Legacy preference semantics are handled safely.
- [x] Nearby invite tests cover full-party target, cooldowns, leader-only
  inviting, dead, in combat, party target reached, and missing candidates.
- [x] API and UI status still expose settings clearly.
- [x] Backend stack is restarted and LAN/IP access verified.

## Phase 2 Checklist

- [x] Quest intake sweep accepts eligible local quests before leaving a hub.
- [x] Pursuit scoring considers nearby party size.
- [x] Hard quests remain gated when the party is not ready.
- [x] Tests cover accepted-but-deferred quests and grouped pursuit.

## Phase 3 Checklist

- [x] Hosted parties emit real party chat lines for plan, ack, praise, and
  correction.
- [x] Chat produces validated behavior intent.
- [x] Behavior layers consume intent without parsing free-form text.
- [x] Template fallback works without LLM.

## Phase 4 Checklist

- [x] Buff, heal, tank, focus, regroup, and recovery behavior work in hosted
  parties.
- [x] Support behavior does not suppress in-range opening attacks.
- [x] Tests cover class-role combinations used in the level 20 run.

## Phase 5 Checklist

- [x] Live harness can start from the persistent LAN/IP stack.
- [x] Harness observes invites, party size, chat, support, quests, deaths, and
  progression.
- [x] Harness writes a concise machine-readable artifact.

## Phase 6 Checklist

- [ ] One final post-change hosted run reaches level 20.
- [ ] All practical pre-20 quests are complete or documented with a valid
  blocker.
- [ ] Final run includes party fill, ongoing invites, chat, buffs, healing,
  tanking, focus fire, regrouping, and recovery.
- [x] Party chat is paced below server rate limits during repeated combat and
  regroup intent changes.
- [x] Party follow and preparation pauses do not count as repeated brain pathing
  failures.
- [x] Nearby vendor restocking and other self-maintenance commands continue
  during party preparation pauses.
- [x] Stale party roster coordinates do not keep a physically assembled party
  stuck in leader regroup hold.
- [x] Stale regroup or recovery intents release once the current party facts no
  longer require holding the leader.
- [x] Trailing followers keep actively traveling toward the leader while
  `/follow` is cooling down or no longer pulling them.
- [x] Group route gate reductions consider nearby party member levels and no
  longer drag underlevel teammates into higher routes.
- [x] Distant followers return to the leader before doing non-combat
  preparation or preparation-style support.
- [x] Followers outside the 60-yard party action range still travel back to the
  leader instead of dropping to brain behavior while the leader holds regroup.
- [x] Live harness fails unless every client currently sees the target party,
  and reports current party members for diagnosing startup desync.
- [ ] Final run occurs after the last code change and service restart.

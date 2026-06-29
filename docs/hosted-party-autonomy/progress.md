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
- [ ] Final run occurs after the last code change and service restart.

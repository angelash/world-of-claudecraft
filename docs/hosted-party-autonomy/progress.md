# Progress: Hosted Party Autonomy

Current date: 2026-06-29

| Phase | Status | Started | Completed |
|---|---|---|---|
| LAN/IP rules | Complete | 2026-06-29 | 2026-06-29 |
| Planning packet | In progress | 2026-06-29 |  |
| Phase 1 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 1 QA | Pending |  |  |
| Phase 2 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 2 QA | Pending |  |  |
| Phase 3 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 3 QA | Complete | 2026-06-29 | 2026-06-29 |
| Phase 4 | Complete | 2026-06-29 | 2026-06-29 |
| Phase 4 QA | Complete | 2026-06-29 | 2026-06-29 |
| Phase 5 | Pending |  |  |
| Phase 5 QA | Pending |  |  |
| Phase 6 | Pending |  |  |
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

- [ ] Live harness can start from the persistent LAN/IP stack.
- [ ] Harness observes invites, party size, chat, support, quests, deaths, and
  progression.
- [ ] Harness writes a concise machine-readable artifact.

## Phase 6 Checklist

- [ ] One final post-change hosted run reaches level 20.
- [ ] All practical pre-20 quests are complete or documented with a valid
  blocker.
- [ ] Final run includes party fill, ongoing invites, chat, buffs, healing,
  tanking, focus fire, regrouping, and recovery.
- [ ] Final run occurs after the last code change and service restart.

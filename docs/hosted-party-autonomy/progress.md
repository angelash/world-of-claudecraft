# Progress: Hosted Party Autonomy

Current date: 2026-06-29

| Phase | Status | Started | Completed |
|---|---|---|---|
| LAN/IP rules | Complete | 2026-06-29 | 2026-06-29 |
| Planning packet | In progress | 2026-06-29 |  |
| Phase 1 | Pending |  |  |
| Phase 1 QA | Pending |  |  |
| Phase 2 | Pending |  |  |
| Phase 2 QA | Pending |  |  |
| Phase 3 | Pending |  |  |
| Phase 3 QA | Pending |  |  |
| Phase 4 | Pending |  |  |
| Phase 4 QA | Pending |  |  |
| Phase 5 | Pending |  |  |
| Phase 5 QA | Pending |  |  |
| Phase 6 | Pending |  |  |
| Phase 6 QA | Pending |  |  |

## Completed

- LAN/IP helper rules were added and pushed in commit `21bb4182`.
- The Windows helper delegates to `online_lan.mjs`, preserves IP access, and is
  agent-maintainable after service unregister.

## Planning Packet Checklist

- [x] Capture user requirements.
- [x] Record current-state gap analysis.
- [x] Define target design.
- [x] Define phase plan.
- [x] Define validation matrix.
- [x] Prepare planning docs for commit and push.

## Phase 1 Checklist

- [ ] Cooperative hosted defaults are applied.
- [ ] Legacy preference semantics are handled safely.
- [ ] Nearby invite tests cover full-party target, cooldowns, leader-only
  inviting, dead, in combat, party target reached, and missing candidates.
- [ ] API and UI status still expose settings clearly.
- [ ] Backend stack is restarted and LAN/IP access verified.

## Phase 2 Checklist

- [ ] Quest intake sweep accepts eligible local quests before leaving a hub.
- [ ] Pursuit scoring considers party size and role coverage.
- [ ] Hard quests remain gated when the party is not ready.
- [ ] Tests cover accepted-but-deferred quests and grouped pursuit.

## Phase 3 Checklist

- [ ] Hosted parties emit real party chat lines for plan, ack, praise, and
  correction.
- [ ] Chat produces validated behavior intent.
- [ ] Behavior layers consume intent without parsing free-form text.
- [ ] Template fallback works without LLM.

## Phase 4 Checklist

- [ ] Buff, heal, tank, focus, regroup, and recovery behavior work in hosted
  parties.
- [ ] Support behavior does not suppress in-range opening attacks.
- [ ] Tests cover class-role combinations used in the level 20 run.

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

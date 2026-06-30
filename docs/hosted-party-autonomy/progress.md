# Progress: Hosted Party Autonomy

Current date: 2026-06-30

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
  priority. Nearby alive party members influence safe pursuit gates, with the
  current Phase 6 cap tightened to one level after live-run deaths. Group
  movement now prioritizes dungeon entry and regroup follow over pre-pull
  preparation when already assembled.
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
- The next level 20 run reached full current-party agreement, all clients active,
  level 5, and multiple extra quest turn-ins, but Cord died during a dangerous
  pull near the southeast supplies and bandit camp. The route planner had let a
  5-player party lower dense 6+ route gates by one level. Dense camp routes now
  opt out of party level-bonus gating, so the group can still benefit from
  party strength on safer routes but must level to the original safe level before
  entering supplies, mine, bandit, ringleader, and chapel-dense routes.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the related test suite and server build passed, and the short live
  harness passed with current full-party agreement, hosted invite, party chat,
  intent, support or combat, quest signals, runtime clean, and max stuck resets
  within limit.
- The next level 20 run reached early party fill but was invalid because the
  leader filled the fifth slot with a closer ambient bot (`Ilyraafsn`) while
  the real harness mage (`Cordazxbfwc`) was still outside the current party.
  Auto-invite now still allows ambient fillers, but prefers visible non-ambient
  players before ambient bots so nearby real hosted members do not get crowded
  out of a full party.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, and the short live harness passed with current full-party
  agreement across the 5 new clients, hosted invites, party chat, intent,
  support or combat, quest state on all members, runtime clean, and stuck
  resets 0.
- The next level 20 run reached level 3 with the correct 5-client party, but
  was invalid because a player death occurred. The old harness recent-event
  summary dropped `entityId` and `killerId` and counted the same death once per
  client receiver, so the harness now records de-duplicated player death details
  before the next reproduction run.
- The following reproduction run kept the correct 5-client party alive for
  about 25 minutes with zero player deaths, but only reached level 4 and the
  leader spent too much time grinding low-yield Wild Boars after the early
  quest chain. Grind fallback now uses the full world view: Eastbrook bots that
  have moved past boars grind Webwood Lurkers while waiting for level gates,
  Mirefen fallback stays on local marsh mobs, and Thornpeak fallback moves from
  Stormcrag to Wyrmcult targets at the high end.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, and the short live harness passed with current full-party
  agreement, hosted invite, party chat, intent, support or combat, quest
  signals, runtime clean, and stuck resets within limit.
- The next long run confirmed the new grind fallback at level 4, but progression
  was still too slow for a 20-level acceptance window. A temporary experiment let
  full 5-player parties lower safe route gates by up to 2 levels, while dense
  camp routes still opted out. Later live runs proved that was still too
  aggressive around murlocs and Greyjaw, so Phase 6 now caps every party route
  reduction at one level.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, and the short live harness passed with current full-party
  agreement, hosted invite, party chat, intent, support or combat, quest
  signals, runtime clean, and stuck resets within limit.
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
- The next level 20 run `tmp/hosted-play-level20-20260630-101426.json` kept the
  correct five-client party and stayed free of hosted or WebSocket errors, but
  Cord died near Old Greyjaw and Elowen died during the Mudfin turn-in. In both
  cases a fragile non-tank member was critically low while ordinary combat or
  quest brain behavior continued. Group support now gives non-tank members a
  self-preservation step before focus fire: use a healing potion if available,
  stop attacking, clear the hostile target, and collapse back toward the tank
  or leader.
- After the self-preservation fix, the stack was restarted, IP access was
  verified on `0.0.0.0`, and the short live harness passed with current
  full-party agreement, hosted invite, party chat, intent, support or combat,
  quest signals, clean runtime, and stuck resets within limit.
- A follow-up 20-level run reached about 16 minutes with a clean five-player
  party, no deaths, no hosted or WebSocket errors, and max stuck resets 0, but
  the new self-preservation path retried healing potions faster than the
  server's potion cooldown. The self-preservation potion command now uses a
  60 second cooldown, and a regression test prevents the old 3 second retry.
- Follow-up report `tmp/hosted-play-level20-20260630-113229.json` then ran
  about 31 minutes with a full party, no deaths, no hosted errors, and no
  WebSocket errors, but failed the stuck-reset gate when Aldric tried to travel
  from Eastbrook to Fenbridge to pick up `q_prowlers` at level 4. Distant quest
  pickups now require the route's original `pursueAtLevel`, while already
  accepted safe routes can still benefit from nearby full-party pursuit.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the targeted brain suite, hosted behavior suite, server build, and
  short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T04-17-19-755Z.json`.
- The first final level 20 attempt after that commit ended at 60 seconds
  because the live harness let a transient hosted-status `fetch failed`
  exception escape from `Promise.all`. The run had already reached a full party,
  no deaths, no hosted errors, no WebSocket errors, and stuck resets 0, so this
  was a harness robustness issue rather than a gameplay failure. The harness now
  retries hosted-status polls, records recovered sampling failures separately,
  and only aborts after repeated consecutive sampling failures.
- Follow-up report `tmp/hosted-play-level20-20260630-123354.json` passed the
  prior Fenbridge pickup risk and reached level 5 with a full party, no hosted
  errors, no WebSocket errors, and no status-poll errors, but failed because
  Elowen died once near the murloc and Greyjaw travel band. The immediate bad
  behavior was a level 4 non-tank at emergency health continuing `brain:combat`
  around a restock objective instead of retreating from a single active threat.
  The ambient brain now starts dangerous-pull retreat at level 4 and treats a
  single threat plus emergency health as enough to retreat, and the harness
  de-duplicates the same player death reported as both `death` and
  `playerDeath`.
- After that fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the targeted brain suite, hosted behavior suite, server build, and
  short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T05-11-24-049Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-131512.json` passed the
  Fenbridge pickup risk and the prior Elowen emergency-health scenario, but
  Brana died once around 33 minutes while at level 4 with 38/90 to 33/90 health
  and a single active threat. The 32 percent emergency threshold was too low
  for cloth and healer safety, so single-threat retreat now starts below 45
  percent health.
- After that threshold fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the targeted brain suite, hosted behavior suite, server build, and
  short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T05-51-19-202Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-135502.json` still failed
  around the Old Greyjaw and Mudfin lake travel band. A full level 4 party could
  move into level 6-style risk too early, and Greyjaw at level 4 remained unsafe
  for fragile non-tank members even after emergency retreat tuning. Party route
  reductions are now capped at one level for every group size, and `q_greyjaw`
  starts at level 5.
- After that safety-gate fix, the stack was restarted, IP access was verified on
  `0.0.0.0`, the targeted brain suite, hosted behavior suite, server build, and
  short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T06-32-26-730Z.json`.
- The next post-commit level 20 attempt
  `tmp/hosted-play-level20-20260630-143908.json` was stopped at about 24
  minutes before a death because Brana was still level 4 but had already picked
  `hunt_greyjaw`. The base route was level 5, but the one-level party bonus
  still lowered it back to 4. Old Greyjaw now opts out of party level bonuses,
  matching the intended "wait until level 5" rule.
- After that Greyjaw bonus opt-out, the stack was restarted, IP access was
  verified on `0.0.0.0`, the targeted brain suite, hosted behavior suite,
  server build, and short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T07-07-57-024Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-151234.json` confirmed the
  Greyjaw opt-out held, but failed later around levels 6 to 7 with repeated
  player deaths. The party had recovery intent active, yet members without an
  immediate heal or taunt action could still resume ordinary brain work such as
  `collect_supplies`, splitting the group while fragile members were critical.
  Hosted party recovery now pauses ordinary brain work, stops attacks, clears
  unsafe targets, and travels back to a stable party anchor when recovery is
  needed and no higher-priority support action is available.
- After that recovery hard-pause fix, the stack was restarted, IP access was
  verified on `0.0.0.0`, the hosted party suite, hosted behavior suite, server
  build, and short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T08-37-40-545Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-164236.json` failed much
  earlier when Corda died at level 2. The death timeline showed recovery intent
  active, but the mage dropped from about 70 percent health to near zero in
  roughly 20 seconds, so the previous self-preservation threshold was too late
  for low-level cloth survival. Non-tank group self-preservation now starts at
  72 percent health during party combat, and healing potion use starts at 65
  percent.
- After that earlier self-preservation fix, the stack was restarted, IP access
  was verified on `0.0.0.0`, the hosted party suite, hosted behavior suite,
  server build, and short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T08-54-55-735Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-165949.json` reached
  level 7 with party size 5, no hosted, WebSocket, or status errors, and no
  stuck resets, but failed with 8 player deaths. Samples showed
  `recovery/recover` intent active while healthy damage dealers still resumed
  focus-fire style combat near critical or dead teammates, so the recovery
  state needed to suppress ordinary offensive support, not just ordinary quest
  brain work.
- Hosted party support now suppresses normal focus fire while any party member
  is dead or below the recovery threshold. Healing, self-preservation, and tank
  protection can still act first; otherwise hosted members stop attacking,
  clear unsafe targets, and collapse toward the recovery anchor.
- After the recovery focus-suppression fix, the stack was restarted, IP access
  was verified on `0.0.0.0`, the hosted party suite, ambient brain suite,
  hosted behavior suite, server build, and short live harness all passed. The
  short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T10-30-40-509Z.json`.

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
- [x] Dense camp routes do not use party strength to enter one level early after
  the level 5 supplies-camp death.
- [x] Auto-invite prefers visible non-ambient players over ambient bot fillers
  when both are nearby.
- [x] Low-health non-tank members stop attacking, clear unsafe targets, use
  available healing potions, and collapse back to the party before resuming
  focus fire.
- [x] Distant cross-zone quest pickups do not use party strength to bypass the
  original route gate, while accepted safe quests can still use group pursuit.
- [x] The live harness tolerates transient hosted-status poll failures without
  hiding repeated REST sampling failure.
- [x] Level 4 characters at emergency health retreat from a single active
  threat before continuing restock, turn-in, or combat objectives.
- [x] Full-party route gate reductions are capped at one level, and Old Greyjaw
  pursuit waits until level 5 after repeated live deaths near the murloc and
  Greyjaw band.
- [x] Old Greyjaw opts out of party level bonuses so a level 4 full party cannot
  lower the level 5 route gate back to 4.
- [x] Hosted party recovery pauses ordinary brain work and pulls members back
  to a stable party anchor instead of letting quest collection continue while
  the team is critical.
- [x] Non-tank group self-preservation starts early enough for low-level cloth
  and healer safety instead of waiting until the character is nearly dead.
- [x] Party recovery suppresses hosted damage-dealer focus fire while another
  member is dead or critical, while preserving healing, self-preservation, and
  tank protection.
- [ ] Final run occurs after the last code change and service restart.

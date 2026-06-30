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
- Follow-up report `tmp/hosted-play-level20-20260630-183604.json` reached
  level 3 with party size 5, broad quest intake, no stuck resets, and no hosted,
  WebSocket, or status errors, but failed with deaths for Corda and Brana.
  Samples showed the party was already issuing recovery and correction intents,
  but low-level cloth recovery waited until about 45 percent health and a
  distant healer could keep local combat or restock brain while regroup intent
  was active.
- Hosted party recovery now starts at 72 percent health, uses available healing
  potions below 65 percent from the party recovery path itself, and makes
  distant followers return to the leader during regroup intent even while they
  are in combat. This prevents local combat or restock brain from overriding a
  real party reset call.
- After that early recovery and regroup-return fix, the stack was restarted, IP
  access was verified on `0.0.0.0`, the hosted party suite, ambient brain suite,
  hosted behavior suite, server build, and short live harness all passed. The
  short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T11-00-03-907Z.json`.
- Follow-up report `tmp/hosted-play-level20-20260630-190448.json` failed at
  level 1 when Aldric died during an early recovery window. The party recovery
  intent was active, but Aldric was the low-health leader and tank-style support
  or preparation commands could still preempt his own recovery pause, leaving
  him at 3 health while commands such as target, cast, and attack continued.
- Low-health hosted members now take urgent recovery before support
  coordination. When the local character is at or below the recovery threshold,
  the party coordinator uses the recovery path first, including potion use,
  stop attack, target clear, and recovery-anchor travel, before any tank
  support, preparation, or offensive action can run.
- After that urgent self-recovery priority fix, the stack was restarted, IP
  access was verified on `0.0.0.0`, the hosted behavior suite, server build,
  and short live harness all passed. The short harness report was
  `tmp/hosted-play-live-harness-2026-06-30T11-10-17-012Z.json`.

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
- [x] Party recovery starts before low-level cloth members become critical,
  directly uses healing potions, and makes distant followers return during
  regroup correction even while in combat.
- [x] A low-health hosted leader or tank recovers before support preparation,
  tanking, or offensive commands can preempt self-preservation.
- [x] Hosted party recovery uses a tighter 4-yard recovery anchor and wounded
  leaders prefer stable healer anchors before closer damage dealers.
- [x] The tight recovery-anchor fix was unit-tested, server-built, restarted
  through the LAN/IP stack, and verified with a short live harness report at
  `tmp/hosted-play-live-harness-2026-06-30T11-29-43-962Z.json`.
- [x] A failed level 20 candidate at
  `tmp/hosted-play-level20-20260630-193345.json` showed wounded members
  stopping at the edge of the 4-yard recovery anchor while still taking damage.
  Self-low-health recovery now uses a 1.5-yard urgent anchor and has a focused
  regression test.
- [x] The live harness now uses profanity-filter-safe test names and
  consonant-only unique suffixes so validation is not blocked by character name
  rejection.
- [x] A failed level 20 candidate at
  `tmp/hosted-play-level20-20260630-195329.json` showed a wounded hosted
  priest moving toward recovery but dying before self-healing. Low-health
  healer-capable hosted members can now cast urgent self-heal or shield support
  before movement recovery.
- [x] Short harness report
  `tmp/hosted-play-live-harness-2026-06-30T12-05-24-660Z.json` showed low-health
  members reaching the recovery cluster but still dying while actively targeted.
  Threatened urgent recovery now retreats past the anchor away from the nearby
  mob.
- [x] Short harness report
  `tmp/hosted-play-live-harness-2026-06-30T12-14-56-982Z.json` still showed a
  low-health tank dying during recovery. Recovery focus suppression now has a
  protective exception for mobs actively attacking low-health party members.
- [x] The protective recovery focus fix was restarted through the LAN/IP stack
  and verified with short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T12-26-47-398Z.json`.
- [x] A post-recovery level 20 candidate at
  `tmp/hosted-play-level20-20260630-203014.json` reached a full party with no
  deaths or hosted errors, but by 23.5 minutes the group was only level 3 to 4
  and members were repeatedly 20 to 30 yards apart on separate objectives. Party
  regroup correction is now tightened to 18 yards, and combat-split followers
  stop attacking, clear local targets, and return to the leader before local
  fighting continues.
- [x] The tight-formation fix was unit-tested, server-built, restarted through
  the LAN/IP stack, verified on `0.0.0.0` with printed IP URLs, and smoke-tested
  with live harness report
  `tmp/hosted-play-live-harness-2026-06-30T13-00-44-250Z.json`.
- [x] The next level 20 candidate at
  `tmp/hosted-play-level20-20260630-210322.json` stayed full-party and clean
  for 25.6 minutes, but exposed quest sync lag: Alden and Tovin had finished
  wolves, boars, and spiders while Mira and Liora were still active on boars
  and spiders. Hosted runtime now lets tight grouped followers continue local
  accepted quest objectives while follow movement is paused, so lagging members
  can finish nearby work before being pulled onward.
- [x] The local active quest override was unit-tested, server-built, restarted
  through the LAN/IP stack, verified on `0.0.0.0` with printed IP URLs, and
  smoke-tested with live harness report
  `tmp/hosted-play-live-harness-2026-06-30T13-34-19-062Z.json`.
- [x] A later level 20 candidate at
  `tmp/hosted-play-level20-20260630-213929.json` stayed full-party, death-free,
  and runtime-clean for about 28.6 minutes, but showed the leader still
  advancing after finishing `q_boars` while several members lacked boar hides.
  `partyInfo` now carries member quest logs and completed quest ids, and the
  ambient brain backfills the earliest living party member's active or ready
  quest route before pushing its own later active route.
- [x] The party quest backfill fix was covered by social snapshot tests and
  ambient brain tests for active and ready member backfill. The targeted 6-file
  hosted, brain, group, chat, and social regression passed, and
  `npm run build:server` passed. `npx tsc --noEmit` still reports existing
  repository type errors in unrelated files and generated locale outputs, so it
  is recorded as a known broad gate blocker, not a blocker for this focused
  runtime build.
- [x] The party quest backfill fix was restarted through the LAN/IP stack,
  verified on `0.0.0.0` with printed IP URLs and `/api/status`, and
  smoke-tested with live harness report
  `tmp/hosted-play-live-harness-2026-06-30T14-25-44-997Z.json`.
- [x] Level 20 candidate
  `tmp/hosted-play-level20-20260630-222842.json` was stopped after Miraj died
  at about 13.1 minutes. The party was already in recovery, but the low-level
  priest self-heal path tried to hard-cast under threat and skipped the
  stronger stop, clear-target, and retreat recovery path. Hosted recovery now
  makes threatened low-health healers retreat instead of standing still for a
  long self-heal cast.
- [x] The healer recovery fix was unit-tested, covered by the 6-file hosted
  party regression, server-built, restarted through the LAN/IP stack, verified
  on `0.0.0.0` with printed IP URLs and `/api/status`, and smoke-tested with
  live harness report
  `tmp/hosted-play-live-harness-2026-06-30T14-50-36-383Z.json`.
- [x] The next level 20 candidate
  `tmp/hosted-play-level20-20260630-225342.json` stayed death-free and
  runtime-clean, but was stopped after about 23 minutes because lagging members
  were still stuck on `q_boars` personal drops while the party stayed in
  follow/regroup modes. Hosted runtime now lets tight followers execute nearby
  `loot` brain commands while party follow, regroup, or preparation has paused
  ordinary brain drive.
- [x] The local loot override was covered by a hosted runtime test, the 6-file
  hosted party regression, server build, LAN/IP restart, IP URL and status
  verification, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T15-22-10-342Z.json`.
- [x] Level 20 candidate
  `tmp/hosted-play-level20-20260630-232527.json` stayed full-party, death-free,
  and runtime-clean, but was stopped after about 27 minutes because the party
  repeatedly fell into recovery around the boar and spider route. The final
  samples showed a low-health tank with food and a potion available while the
  hosted runtime suppressed the ambient brain's `recover` use command during an
  `assist_party` recovery pause.
- [x] Hosted runtime now lets only `recover` use-consumable commands pass
  through party recovery pauses while keeping ordinary local combat, loot, and
  quest brain commands paused. The fix has focused runtime tests for both the
  allowed consumable use and the blocked local combat case.
- [x] The recovery consumable override was covered by
  `npx vitest run tests\hosted_play_runtime.test.ts`, the 6-file hosted,
  brain, group, chat, and social regression, `npm run build:server`, LAN/IP
  restart, `0.0.0.0` port verification, printed IP URLs, `/api/status`, and
  short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T16-02-17-977Z.json`.
- [x] Post-fix level 20 candidate
  `tmp/hosted-play-level20-20260701-000540.json` reached a full party with no
  deaths or hosted, WebSocket, or status errors, but was stopped around 16
  minutes because the leader finished boars and spiders while four party
  members still had active `q_boars` progress. The root cause was a live-path
  gap: `Sim.partyInfo` carried member `qlog` and `qdone`, but
  `GameServer.partyWire()` did not, so hosted runtime and ambient backfill could
  not see teammate quest state online.
- [x] `GameServer.partyWire()` now includes member `qlog` and `qdone`, with a
  hosted live-state seam test proving the online hosted path exposes teammate
  quest state for backfill decisions.
- [x] The hosted party quest-state wire fix was covered by
  `npx vitest run tests\hosted_play_game_server.test.ts`, the 7-file hosted,
  brain, group, chat, and social regression, `npm run build:server`, LAN/IP
  restart, `0.0.0.0` port verification, printed IP URLs, `/api/status`, and
  short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T16-29-09-687Z.json`.
- [x] Follow-up level 20 candidate
  `tmp/hosted-play-level20-20260701-003111.json` proved the party quest-state
  wire fix worked: all five members completed `q_wolves` and `q_boars`, but
  Corin died at level 2 during a boar fight. The death timeline showed Corin
  at 60/67 health still following focus intent, then at 46/67 health with no
  potion command, leaving too little time for a cloth character to escape.
- [x] Low-level fragile party members now self-preserve earlier while
  threatened. Hosted and ambient support treat level 4 and below mage, priest,
  and warlock characters as fragile under direct aggro below 90 percent health,
  stop attacks, clear unsafe targets, retreat through the urgent recovery path,
  and use a healing potion at the 72 percent party recovery line instead of
  waiting for the ordinary 65 percent potion line.
- [x] Party intent now calls recovery for the same low-level fragile threat
  case, so party chat and behavior both switch away from focus before the
  member becomes critical.
- [x] The fragile-threat recovery fix was covered by
  `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_party_chat.test.ts`,
  the 7-file hosted, brain, group, chat, game-server, and social regression,
  `git diff --check`, `npm run build:server`, LAN/IP restart, `0.0.0.0` port
  verification, printed IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T16-57-01-151Z.json`.
- [x] Post-fix observation run
  `tmp/hosted-play-level20-20260701-010039.json` stayed full-party,
  death-free, runtime-clean, and stuck-free through level 5, but it showed a
  slow level-5 grind: after the murloc and Greyjaw work was complete, the party
  still used Webwood Lurkers while waiting for level 6 dense-route gates.
- [x] Full nearby level-5 parties that have completed `q_murlocs` now grind
  Mudfin Skulkers instead of Webwood Lurkers while waiting for the level 6
  route gates. This keeps the dense supplies, mine, and bandit safety gates at
  level 6, but lets a proven full group choose a more level-appropriate local
  fallback.
- [x] The level-5 full-party murloc grind fallback was covered by
  `npx vitest run tests\ambient_player_bot_brain.test.ts`, the 7-file hosted,
  brain, group, chat, game-server, and social regression, `git diff --check`,
  `npm run build:server`, LAN/IP restart, `0.0.0.0` port verification, printed
  IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T17-58-57-655Z.json`.
- [x] Short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T18-19-50-394Z.json` reached a
  current full party with invite, chat, intent, quest, and support signals, but
  failed clean runtime because Corin, a level 1 mage, died during a recovery
  window. Samples showed recovery intent active while the low-level cloth
  member was still below 90 percent health and before the direct aggro snapshot
  consistently triggered urgent self recovery.
- [x] Low-level fragile hosted members now obey recovery intent as a hard
  self-preservation signal even when the current mob snapshot does not show
  direct aggro. Level 4 and below mage, priest, and warlock members under a
  recovery intent below 90 percent health use the urgent recovery path, stop
  attacking, clear unsafe targets, and return to the recovery anchor before
  ordinary support or offense can continue.
- [x] Ambient group support now runs self-preservation before party healing, so
  a wounded threatened healer retreats, stops attacking, and clears target
  before trying a long hard-cast heal under pressure.
- [x] The recovery-intent self-preservation fix was covered by
  `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_group.test.ts`,
  the 7-file hosted, brain, group, chat, game-server, and social regression,
  `git diff --check`, `npm run build:server`, LAN/IP restart, `0.0.0.0` port
  verification, printed IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T18-33-58-431Z.json`.
- [x] Level 20 candidate
  `tmp/hosted-play-level20-20260701-023827.json` stayed full-party,
  runtime-clean, and death-free through level 5 and the murloc turn-in, but
  failed during level 5 Mudfin grind when Alden, the warrior leader, died once.
  The failure showed the frontline recovery path waiting for the ordinary 72
  percent self-health threshold, which was too late for a tank under sustained
  direct aggro.
- [x] Hosted frontline members now start urgent self-recovery under direct
  threat at 82 percent health. Warrior, paladin, and druid members who are
  directly targeted stop attacking, clear unsafe targets, retreat through the
  urgent anchor path, and use the existing forced-recovery potion line before
  they become critical.
- [x] The frontline direct-threat recovery fix was covered by
  `npx vitest run tests\hosted_play_party.test.ts`, the 7-file hosted, brain,
  group, chat, game-server, and social regression, `git diff --check`,
  `npm run build:server`, LAN/IP restart, `0.0.0.0` port verification, printed
  IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T19-36-31-774Z.json`.
- [x] Level 20 candidate
  `tmp/hosted-play-level20-20260701-033916.json` stayed full-party,
  death-free, runtime-clean, and stuck-free into level 6, accepted the dense
  supplies and mine route, and survived a low-health recovery window around
  the ringleader. It was stopped at about 78 minutes because done members kept
  backfilling a party collect route by clicking supply crates they could no
  longer collect, producing repeated `The crate is nailed shut.` errors and no
  quest-event progress.
- [x] Collect route backfill now separates local collection from party escort.
  A member only clicks a collect object when its own quest progress still needs
  that objective. Members who have already completed or do not hold that
  collect objective stay near the route camps as escorts, where normal party
  support can heal, protect, and fight without spamming invalid interactions.
- [x] Route work checks now infer the objective index for simple collect and
  kill routes, so a route with full local progress is no longer treated as
  unfinished merely because it did not declare an explicit
  `questObjectiveIndex`.
- [x] The collect-backfill escort fix was covered by
  `npx vitest run tests\ambient_player_bot_brain.test.ts`, the 7-file hosted,
  brain, group, chat, game-server, and social regression, `git diff --check`,
  `npm run build:server`, LAN/IP restart, `0.0.0.0` port verification, printed
  IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T21-06-22-045Z.json`.
- [x] Level 20 candidate
  `tmp/hosted-play-level20-20260701-051040.json` reached level 6 with a full
  party and no invalid supply-crate spam, proving the collect escort fix, but
  failed clean runtime during the level 5 to 6 Mudfin and restock transition.
  Samples showed recovery intent dropping back to focus or buffs while members
  were still below the hosted recovery threshold, and nearby restock or combat
  brain work could continue during an otherwise active recovery window.
- [x] Hosted recovery now has an explicit `recover_party` no-advance state for
  party recovery pauses without a movement target. The runtime no longer lets
  restock, buy, quest, or ordinary self-maintenance brain work override that
  pause. Party intent also uses the same 72 percent hosted recovery line, so
  chat continues to call recovery until the party is actually stable.
- [x] Group support now suppresses non-healing preparation and buff passes while
  focus fire is suppressed for party recovery, letting healing, tank protection,
  self-preservation, and protective focus remain the only allowed recovery
  actions.
- [x] The recovery hard-pause fix was covered by
  `npx vitest run tests\hosted_play_party.test.ts tests\hosted_play_runtime.test.ts tests\ambient_player_bot_party_chat.test.ts`,
  the 7-file hosted, brain, group, chat, game-server, and social regression,
  `node scripts\i18n_resolved_hash.mjs --check`, `git diff --check`,
  `npm run build:server`, `npm run build`, LAN/IP restart, `0.0.0.0` port
  verification, printed IP URLs, `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T22-36-21-740Z.json`.
- [x] Level 20 candidate `tmp\hosted-play-level20-20260701-063937.json`
  reached a full five-player party and showed invite, chat, roles, quest, and
  recovery signals, but failed around level 2 with six player deaths. Samples
  showed `recovery/recover` intent active while status still displayed
  `target`, `cast`, `attack`, `loot`, restock, and combat objectives. The group
  also kept trying to act while several members were below a safe recovery line.
- [x] Hosted recovery now holds active recovery intent until all living members
  are above the stable line, about 90 percent health, instead of releasing as
  soon as the 72 percent start line is crossed. Recovery support now allows only
  healing, self-preservation, taunt or growl protection, and narrow protective
  focus when exactly one non-self member is unstable and the helper is stable.
  Ordinary tank offense, preparation, and damage-dealer focus remain blocked.
- [x] Hosted runtime debug command snapshots now record the effective commands
  allowed by the party coordinator, so live reports no longer show suppressed
  brain `target`, `cast`, `attack`, or `loot` commands as if they were active
  behavior during recovery.
- [x] Focused validation after the recovery stabilization fix passed:
  `npx vitest run tests\hosted_play_party.test.ts tests\hosted_play_runtime.test.ts tests\ambient_player_bot_group.test.ts`.
- [x] Broader validation after the recovery stabilization fix also passed:
  `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\hosted_play_game_server.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`.
- [x] Recovery stabilization was also covered by `git diff --check`,
  `npm run build:server`, `npm run build`, LAN/IP restart through
  `scripts\windows_stack.ps1`, `0.0.0.0` port verification, printed IP URLs,
  `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T23-07-38-590Z.json`. The short run
  reached the target five-player party, observed invite, chat, intent, quest,
  and support signals, stayed runtime-clean, and had zero player deaths.
- [ ] Final run occurs after the last code change and service restart.

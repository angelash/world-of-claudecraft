# State: Hosted Party Autonomy

## Current Phase

Phase 5 implementation and QA are complete. Phase 6 long-run validation is in
progress.

## Locked Decisions

- Preserve LAN/IP startup through `scripts/windows_stack.ps1` or
  `scripts/online_lan.mjs`.
- Backend and startup-read changes require automatic restart before reporting
  success.
- Hosted party autonomy must use normal commands and movement input only.
- Server authority and sim determinism remain intact.
- Cooperative hosted play should default toward full-party behavior while
  keeping visible controls for solo mode and smaller targets.
- Social realism starts with believable hosted party play. Wider NPC and monster
  ecology is deferred.
- The final acceptance run must be a single clean pass after the last code
  change.
- Hosted play defaults now resolve to `follow_leader`,
  `autoInviteNearbyPlayers: true`, and target party size `5`.
- `hosted_play_preferences_version` marks explicitly saved hosted settings.
  Legacy rows that still contain the old blank default tuple `solo/off/2` and
  version `0` are read as the new cooperative defaults.
- Quest intake and pursuit are now separate in the ambient brain. Visible
  nearby quest givers can be accepted before the route leaves a hub, but
  resupply remains higher priority.
- Nearby alive party members can lower route pursuit gates, but the current
  safety cap is one level for every group size.
- Dungeon entry and follower regrouping now run before party preparation when
  the group is already at the door or already inside the objective dungeon.
- Party chat now produces a structured party intent before generating player
  lines. The intent categories are route plan, buffs, focus, praise,
  correction, and recovery.
- Hosted party coordination may consume `holdAdvance` intent from the previous
  party-chat tick to pause leader brain drive for recovery, preparation, or
  regrouping without parsing free-form chat.
- Hosted debug details expose party role, duty, intent kind, intent behavior,
  intent summary, intent target, and last party chat action.
- Warrior tank support now prioritizes taunting mobs off healers before
  switching into defensive stance.
- Priest support now shields threatened, slightly wounded allies before
  swapping to focus damage, while still allowing full-health tank pulls to keep
  opening damage.
- Non-tank party members who are threatened at dangerous health self-preserve
  before focus fire. They use an available healing potion, stop attacking, clear
  the hostile target, and travel back toward the tank or leader.
- Self-preservation healing potion commands respect the server potion cooldown.
  Do not retry potion use every brain tick while the item is still cooling down.
- The live harness is `scripts/hosted_play_live_harness.mjs`. It uses real REST
  and WebSocket clients against the persistent LAN/IP stack and writes JSON
  artifacts under `tmp/`.
- Non-combat party follow, regroup, and preparation no longer suppress nearby
  local quest accept or turn-in work for hosted followers. Distant old quest
  objectives still do not override follow.
- Hosted party coordination refreshes dynamic party member position, combat,
  health, and resource fields from current `self` and visible player entity
  snapshots before making follow, regroup, support, and assist decisions.
- Hosted party coordination treats party-chat intent as advisory. A
  hold-advance regroup or recovery intent must still match current party facts
  before it can pause the hosted leader.
- Hosted followers no longer rely on `/follow` alone. When a non-combat
  follower is outside close-follow range, party coordination also gives it a
  travel goal toward the leader so movement continues while `/follow` is cooling
  down or no longer pulling.
- Grouped quest route gates now use a conservative party-level check. A partial
  group can reduce a route by at most one level, and every nearby contributing
  party member must meet that grouped safe level.
- A full nearby 5-player party can reduce safe route gates by one level at
  most. Dense camp routes that set `allowPartyLevelBonus: false` still receive
  no party gate reduction.
- `q_greyjaw` pursuit starts at level 5 and opts out of party level bonuses
  after repeated live deaths around the murloc and Old Greyjaw travel band.
- Distant quest pickup travel does not receive party route gate reduction. The
  group can use party strength for accepted safe pursuit, but a far-away giver
  such as Fenbridge `q_prowlers` still requires the original route pickup level.
- Distant non-combat followers must close the leader gap before doing
  preparation buffs or preparation-style support.
- Hosted followers must keep traveling back to the leader at any distance while
  they are alive and not personally in combat. The 60-yard threshold is only a
  party action or assist range, not a cap on regroup travel.
- The live harness must prove current full-party agreement across every client,
  not only that the leader once reached the target party size.
- Dense camp routes may opt out of party level-bonus gating. Group strength can
  lower safer route gates by one level, but supplies, mine, bandit, ringleader,
  and chapel-dense routes must wait for the original safe route level.
- Nearby auto-invite treats ambient bots as filler candidates. If a visible
  non-ambient player and a visible ambient bot are both eligible, the
  non-ambient player wins even when the ambient bot is closer.
- Grind fallback must be local and level-appropriate. After the Eastbrook boar
  and spider chain, deferred level gates grind Webwood Lurkers instead of
  lower-yield Wild Boars; Mirefen and Thornpeak fallback routes stay in their
  current zone instead of walking back to old starter mobs.
- The live harness retries transient hosted-status poll failures and records
  repeated sampling failures separately from gameplay hosted errors. Recovered
  sampling failures should not crash a long validation run, but repeated
  consecutive failures still abort the run.
- Ambient brain dangerous-pull retreat starts at level 4. A single active
  threat below 45 percent health is enough to retreat toward the vendor safe
  point, use an available potion, stop attacking, and clear the target before
  the bot continues restock, turn-in, or combat objectives.
- Hosted party recovery is a hard behavior gate. After healing, taunt, shield,
  or self-preservation support gets first chance, any remaining hosted member
  must pause ordinary brain work, stop attacking, clear unsafe targets, and
  travel back to a stable party anchor while the party still needs recovery.
- Active recovery intent now holds the party until all living members are above
  the stable recovery line, about 90 percent health. The normal 72 percent line
  starts recovery, and the stable line releases it only after the group is ready
  to resume pulls.
- Recovery support is deliberately narrow. During recovery, group support may
  heal, self-preserve, taunt or growl a mob off an ally, or use protective focus
  only when no one is dead, the helper is stable and not threatened, at least
  one non-self member is unstable, and the target mob is actively attacking an
  unstable member. Ordinary tank offense, preparation, and damage-dealer focus
  stay blocked.
- Hosted debug command snapshots now show effective commands that survived the
  recovery gate, not raw brain commands that were suppressed by the party
  coordinator.
- Non-tank group self-preservation starts at 72 percent health during party
  combat, and healing potion use starts at 65 percent health. This is
  intentionally earlier than solo emergency retreat so low-level cloth and
  healer characters do not wait until they are nearly dead.
- The live harness de-duplicates one player death reported through both
  `death` and `playerDeath` events by victim and second-level time bucket.
- `partyInfo` member snapshots now include `qlog` and `qdone` so hosted and
  ambient coordination can reason about party quest sync.
- The ambient quest brain scans party member quest state from earliest route to
  latest route after visible local quest intake and before its own active
  route. A leader who has already completed an earlier route helps a living
  party member finish or turn in that route before pushing ahead.
- Threatened low-health hosted healers use the same urgent recovery pause as
  other fragile roles. They stop attacking, clear their hostile target, and
  retreat to a stable anchor instead of standing still to hard-cast a self heal
  while being hit.
- Nearby corpse loot is treated as local quest work while party movement is
  paused by follow, regroup, or preparation. Tight followers can still target
  and loot nearby corpses so personal quest drops do not stall the whole party.
- Hosted recovery brain commands can use food, drink, or potions while party
  recovery has paused ordinary brain drive, including `assist_party` recovery
  pauses. Other local combat, loot, and quest commands remain suppressed during
  recovery unless they are explicitly allowed by a safer local-work rule.
- The server hosted live-state party wire must include every member's `qlog`
  and `qdone`. Ambient backfill depends on that live path, not only on
  `Sim.partyInfo`, so GameServer seam tests cover it directly.
- Low-level fragile party members under direct aggro must self-preserve before
  the general recovery line. Level 4 and below mage, priest, and warlock
  members begin threatened recovery below 90 percent health, use the urgent
  retreat path, and may use healing potions at the 72 percent party recovery
  line.
- Party-chat intent uses the same low-level fragile threat rule so group
  communication switches to recovery before the member becomes critical.
- Low-level fragile hosted members also treat an active recovery intent as a
  hard self-preservation signal below 90 percent health, even when the current
  mob snapshot does not show direct aggro. This keeps party communication and
  hosted behavior aligned during fast-moving low-level fights.
- Ambient group support must check self-preservation before hard-cast party
  healing so a wounded threatened healer does not stand still to cast while
  being hit.
- Hosted frontline members under direct threat start urgent self-recovery at
  82 percent health. Warrior, paladin, and druid members who are directly
  targeted should retreat, stop attacking, clear target, and use the forced
  recovery potion line before ordinary 72 percent recovery would trigger.
- Full nearby level-5 parties that have completed `q_murlocs` grind Mudfin
  Skulkers while waiting for level 6 dense-route gates. This does not lower the
  supplies, mine, bandit, ringleader, or chapel-dense route gates.
- Collect-route party backfill must not make done members click quest objects
  they cannot collect. A member only interacts with a collect object when its
  own local quest progress still needs that objective; otherwise it escorts the
  party near the route camps and lets support, combat, regroup, and recovery
  behavior protect the member who still needs the object.
- Route objective completion checks infer the objective index for simple
  collect and kill routes when `questObjectiveIndex` is omitted. Full local
  progress must stop active route pursuit even if a live snapshot still says
  the quest state is `active`.
- Hosted leaders in `hold_regroup` must not let local quest, loot, restock,
  buy, preparation, or combat brain work override the regroup pause. The leader
  must wait for living party members outside regroup range before ordinary
  brain drive resumes. Recovery consumables remain governed by the recovery
  gate.
- `q_boars` opts out of party level-bonus pursuit because Bristly Boar Hides
  combines a level-3 route with reactive boar damage. Full level-2 parties may
  pick the quest up, but should grind safer Forest Wolves before hunting boars.
- Healer-capable mana users now contribute to party recovery checks. Recovery
  starts when a healer is at or below 45 percent mana and holds until the healer
  is above about 65 percent mana, so long grind sessions pause for drinks before
  the next pull instead of running the healer dry.

## Key Existing Files

- `server/hosted_play/types.ts`
- `server/hosted_play/runtime.ts`
- `server/hosted_play/party.ts`
- `server/hosted_play/action_log.ts`
- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `server/ambient_bots/group_support.ts`
- `server/ambient_bots/party_roles.ts`
- `server/ambient_bots/party_chat.ts`
- `server/ambient_bots/party_intent.ts`
- `server/main.ts`
- `server/db.ts`
- `src/hosted_play_settings.ts`
- `src/ui/hosted_play_panel.ts`
- `src/net/online.ts`
- `tests/hosted_play_party.test.ts`
- `tests/hosted_play_runtime.test.ts`
- `tests/hosted_play_api.test.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/ambient_player_bot_party_chat.test.ts`
- `scripts/hosted_play_live_harness.mjs`

## Phase 1 Changes

- `src/hosted_play_settings.ts` added
  `HOSTED_PLAY_AUTO_INVITE_DEFAULT_PARTY_SIZE`.
- `server/hosted_play/types.ts` now defaults hosted play to cooperative party
  fill.
- `server/db.ts` added `hosted_play_preferences_version`, updated hosted-play
  column defaults for new characters, upgrades untouched legacy default rows at
  read time, and marks saved preferences with version `1`.
- `tests/character_db.test.ts` covers legacy default upgrade and versioned
  saves.
- `tests/hosted_play_runtime.test.ts` covers default hosted auto invite.
- `tests/hosted_play_party.test.ts` covers dead, combat, and per-target invite
  cooldown guards.

## Phase 1 Validation

- `git diff --check`: passed.
- `npx vitest run tests/character_db.test.ts tests/hosted_play_action_log.test.ts tests/hosted_play_api.test.ts tests/hosted_play_game_server.test.ts tests/hosted_play_llm.test.ts tests/hosted_play_party.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_status_view.test.ts`: passed, 8 files and 67 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- `node scripts/online_lan.mjs urls`: printed LAN/IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Ports `5173` and `8787` listen on `0.0.0.0`.

## Phase 2 Changes

- `server/ambient_bots/brain.ts` added visible nearby quest intake, separated
  quest acceptability from pursuit safety, and lowered pursuit gates using
  nearby party strength.
- `server/ambient_bots/group.ts` now prioritizes assembled dungeon entry before
  preparation and keeps lagging followers in `follow_leader` mode while follow
  cooldown is active.
- `tests/ambient_player_bot_brain.test.ts` covers nearby pickup priority and
  grouped pursuit below solo safe level.

## Phase 2 Validation

- `npx vitest run tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_group.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts`: passed, 5 files and 199 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- `node scripts/online_lan.mjs urls`: printed LAN/IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Ports `5173` and `8787` listen on `0.0.0.0`.

## Phase 3 Changes

- `server/ambient_bots/party_intent.ts` added a validated coordination intent
  object with route plan, buffs, focus, praise, correction, and recovery
  categories.
- `server/ambient_bots/party_chat.ts` now builds leader briefings and member
  acknowledgements from intent instead of only group mode strings.
- `server/ambient_bots/llm_types.ts`, `llm_coordinator.ts`, and
  `llm_prompt.ts` pass the same structured intent into party-chat LLM context.
- `server/hosted_play/party.ts` consumes hold-advance intent to keep a hosted
  leader from advancing after the party just called for recovery or regrouping.
- `server/hosted_play/runtime.ts`, `server/hosted_play/types.ts`,
  `src/net/online.ts`, and `src/ui/hosted_play_panel.ts` expose party roles and
  intent in hosted debug details.
- `src/ui/i18n.catalog/hud_chrome.ts` added English hosted debug labels and
  `npm run i18n:gen` regenerated resolved i18n artifacts.

## Phase 3 Validation

- `npx vitest run tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_party.test.ts tests/hosted_play_runtime.test.ts`: passed, 3 files and 37 tests.
- `npm run i18n:gen`: passed.
- `npx vitest run tests/ambient_player_bot_party_chat.test.ts tests/ambient_player_bot_llm.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/hosted_play_status_view.test.ts`: passed, 5 files and 44 tests.
- `npx vitest run tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts`: passed, 3 files and 53 tests.
- `git diff --check`: passed.
- `npx vitest run tests/localization_fixes.test.ts tests/hosted_play_status_view.test.ts tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts`: passed, 5 files, 66 tests passed and 3 skipped.
- `npm run build:server`: passed.
- `npm run build`: passed with existing Vite chunk, dynamic import, and cursor resolution warnings.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- `node scripts/online_lan.mjs urls`: printed LAN/IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Ports `5173` and `8787` listen on `0.0.0.0`.

## Phase 4 Changes

- `server/ambient_bots/group_support.ts` now tries emergency warrior taunts
  before defensive stance setup.
- `server/ambient_bots/group_support.ts` now lets priests shield threatened,
  slightly wounded allies before switching to focus damage.
- `tests/ambient_player_bot_group.test.ts` covers warrior rescue taunt priority
  and priest shield priority without regressing the existing focus-fire case.
- `tests/hosted_play_party.test.ts` covers the hosted warrior rescue-taunt path.

## Phase 4 Validation

- `npx vitest run tests/ambient_player_bot_group.test.ts`: passed, 19 tests.
- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_party.test.ts`: passed, 3 files and 43 tests.
- `npx vitest run tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/ambient_player_bot_group.test.ts`: passed, 3 files and 50 tests.
- `git diff --check`: passed.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- `node scripts/online_lan.mjs urls`: printed LAN/IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Ports `5173` and `8787` listen on `0.0.0.0`.

## Phase 5 Changes

- `scripts/hosted_play_live_harness.mjs` provisions a temporary five-player
  online party, enables hosted play through the owner hosted-play API, accepts
  real party invites over WebSocket, samples hosted debug status, and records
  invite, quest, chat, support, combat, death, error, and stuck signals.
- `server/hosted_play/runtime.ts` now allows nearby local quest accept and
  turn-in objectives to drive movement and `target/interact` while non-combat
  party follow, regroup, or preparation would otherwise pause the brain.
- `tests/hosted_play_runtime.test.ts` covers grouped followers accepting a
  nearby quest in place, walking a short distance to a nearby quest giver, and
  still ignoring distant legacy quest objectives while following the leader.
- Phase 6 long-run precheck report
  `tmp/hosted-play-level20-20260630-020335.json` reached party size 5 and
  showed healthy quest, support, and combat signals, but it produced 516
  party-chat events in 151 seconds and triggered server chat-rate lock messages.
- `server/ambient_bots/party_chat.ts` now paces leader briefings, uses a shorter
  urgent cooldown for recovery and correction calls, and deterministically picks
  one non-leader party member to acknowledge each leader line.
- `tests/ambient_player_bot_party_chat.test.ts` now covers repeated combat
  intent changes staying paced and full hosted-style parties producing one
  acknowledgement instead of four repeated replies.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-022346.json`
  confirmed chat stayed under control, but the run reached max stuck resets of
  24 while followers were mostly in `follow_leader` and leaders were sometimes
  in preparation pauses. This was a false stuck signal from brain pathing being
  computed before party coordination replaced movement.
- `server/ambient_bots/brain.ts` now exports
  `markAmbientPlayerBotBrainExternalProgress`, which refreshes the brain's
  progress position and clears stale paths when an external coordinator owns the
  movement moment.
- `server/ambient_bots/runtime.ts` and `server/hosted_play/runtime.ts` call that
  helper only when group or hosted party coordination pauses brain drive without
  a travel goal. Explicit party travel goals still use normal stuck detection.
- `tests/ambient_player_bot_brain.test.ts` covers that externally controlled
  party waiting does not count as stuck pathing while the original stuck reset
  test still covers real no-progress movement.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-023833.json`
  showed the stuck fix held at max stuck resets 0 and chat stayed below rate
  limits, but progression stalled for several minutes while party preparation
  paused a vendor restock objective. The brain was at the vendor with safe
  utility commands ready, but hosted party pause prevented the `buy` command.
- `server/ambient_bots/brain.ts` now exports
  `ambientBrainSelfMaintenanceAllowedWhilePartyPaused`, which allows only
  recover, prepare, equip, sell, restock, and upgrade objectives to continue
  during party pauses, and only within a short travel range when movement is
  involved.
- `server/ambient_bots/runtime.ts` and `server/hosted_play/runtime.ts` use that
  helper so party preparation can continue utility self-maintenance while
  combat routing and distant travel remain under party coordination.
- `tests/hosted_play_runtime.test.ts` covers a grouped hosted character buying
  healing potions from a nearby vendor while party preparation pauses movement.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-030127.json`
  reached party size 5 with chat paced, max stuck resets 0, and no hosted
  runtime errors, but stalled at 843 seconds because the leader stayed in
  `hold_regroup` while all members were already physically nearby. The stale
  party roster coordinates lagged behind the visible entity snapshots.
- `server/hosted_play/party.ts` now refreshes party member dynamic fields from
  the current `self` and visible player entities before computing leader
  distance, regroup holds, support, and assist behavior.
- `tests/hosted_play_party.test.ts` covers both stale far roster coordinates
  corrected by nearby live entities and stale near roster coordinates corrected
  by far live entities.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-032810.json`
  showed the stale roster fix worked, but a stale `correction/regroup` intent
  kept the hosted leader in `hold_regroup` after everyone was already assembled.
  At 388 seconds the group was full, healthy, and within a few yards, but no
  level, quest, or position progress had changed for several checkpoints.
- `server/hosted_play/party.ts` now checks current party facts before consuming
  a hold-advance intent. Regroup holds only while a living member is outside
  regroup range, recovery holds only while someone is dead or critically low,
  and stale prepare intent releases back to the normal preparation path.
- `tests/hosted_play_party.test.ts` covers stale regroup intent release after
  the party is assembled and stale recovery intent release after party health
  is stable.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-034227.json`
  reached level 3 and showed intent release working, then stalled because Cordaz
  remained roughly 40 yards from the leader in `follow_leader`. The leader was
  correctly holding regroup, but `/follow` alone was not closing the gap.
- `server/hosted_play/party.ts` now adds a travel goal toward the leader for
  non-combat hosted followers outside close-follow range. This still sends
  `/follow` when the command cooldown allows it, but movement no longer depends
  on chat follow alone.
- `tests/hosted_play_party.test.ts` covers a trailing follower receiving both
  `/follow` and a leader travel goal, plus continued leader travel while
  `/follow` is on cooldown.
- `tests/hosted_play_runtime.test.ts` now covers the hosted runtime applying
  movement input for a trailing follower while preserving the `/follow` command.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-040508.json`
  reached level 5 and confirmed trailing followers kept up, but the run then
  recorded player deaths after the level 5 leader moved level 4 teammates into
  level 6 mine content. The route gate had treated party size alone as enough
  to reduce the safe level too far.
- `server/ambient_bots/brain.ts` now caps party route gate reduction at one
  level and requires all nearby contributing party members to meet the grouped
  safe level before the route counts as pursuable.
- `tests/ambient_player_bot_brain.test.ts` covers both the allowed case (nearby
  party at the grouped safe level can pursue one level early) and the rejected
  case (underlevel nearby members do not unlock a higher route).
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-044758.json`
  stayed death-free through level 5 after the grouped route gate fix, but then
  stalled around 80 minutes when Darian remained away from the leader in
  `prepare_party`. The leader correctly held regroup, but the follower kept
  preparing instead of first closing the gap.
- `server/hosted_play/party.ts` now treats non-combat leader follow as higher
  priority than preparation buffs and preparation-style support when a follower
  is outside close-follow range.
- `tests/hosted_play_party.test.ts` covers a distant paladin follower choosing
  leader follow and a travel goal instead of party preparation buffs.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-061736.json`
  reached a full party and level 5 with no deaths or runtime errors, but then
  exposed another regroup soft lock. A follower more than 60 yards from the
  leader had no leader travel path while the leader waited in regroup hold.
- `server/hosted_play/party.ts` now lets alive, out-of-combat followers travel
  back to the leader at any distance. Followers beyond the 60-yard party action
  range also skip support decisions that would otherwise return before
  regrouping.
- `tests/hosted_play_party.test.ts` covers a 76-yard follower staying in
  leader-follow mode and receiving a leader travel goal while `/follow` is on
  cooldown.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-071151.json`
  reached level 3, but Darian remained `disabled`, party size 1, and quest
  state 0 while the other clients progressed. This invalidated the run before
  it could count as a post-fix level 20 attempt.
- `scripts/hosted_play_live_harness.mjs` now records each client's current
  party member names and adds an `all clients currently see target party` gate.
  It also can enable a nearby member without active inviting when the leader
  already appears full, preventing one disabled client from silently staying
  outside the hosted-party loop.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-072745.json`
  reached full current-party agreement, all clients active, level 5, and
  several quest turn-ins, but Cord died during a dangerous pull near the
  southeast supplies and bandit camp.
- `server/ambient_bots/progression_routes.ts` now lets dense routes opt out of
  party level-bonus gating. Supplies, mine, bandits, ringleader, chapel undead,
  whisper, ledger, silence, and rite routes keep their original safe level even
  in a full party.
- `server/ambient_bots/brain.ts` honors `allowPartyLevelBonus: false` before
  applying the nearby party level bonus.
- `tests/ambient_player_bot_brain.test.ts` covers a level 5 nearby party not
  entering the supplies camp early while preserving the existing murloc group
  bonus coverage.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-083548.json`
  reached early party fill but filled the fifth slot with ambient bot
  `Ilyraafsn` while real harness member `Cordazxbfwc` was outside the current
  party, invalidating the run.
- `server/hosted_play/party.ts` now prefers nearby non-ambient players over
  ambient bot fillers when selecting auto-invite candidates. Ambient bots remain
  eligible as filler when no non-ambient candidate is available.
- `tests/hosted_play_party.test.ts` covers a closer ambient bot losing invite
  priority to a nearby non-ambient player.
- `scripts/hosted_play_live_harness.mjs` now keeps `entityId`, `killerId`, and
  `pid` in slim events, and records de-duplicated `playerDeathRecords` so one
  player death broadcast to all clients is not counted once per receiver.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-090303.json`
  kept the correct 5-client party alive for about 25 minutes with zero player
  deaths, but only reached level 4 because the leader fell back to grinding
  Wild Boars after the early quest chain.
- `server/ambient_bots/brain.ts` now chooses grind fallback from the full world
  view. Eastbrook fallback moves to Webwood Lurkers after boars/spiders or
  deferred murloc/supplies gates, Mirefen fallback stays on local marsh mobs,
  and late Thornpeak fallback moves from Stormcrag Elementals to Wyrmcult
  Zealots.
- `tests/ambient_player_bot_brain.test.ts` covers the updated deferred-route
  grind expectations.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-094001.json`
  confirmed the Webwood grind fallback but still reached only level 4 after
  about 25 minutes.
- A temporary `server/ambient_bots/brain.ts` experiment allowed a full nearby
  5-player party to lower safe route gates by up to two levels. Later live runs
  proved that was too aggressive, so the current rule caps every party route
  reduction at one level. Routes that opt out of party gate reduction remain
  unchanged.
- `tests/ambient_player_bot_brain.test.ts` now covers a level 4 full party
  staying on grind instead of entering the murloc route two levels below the
  solo gate, while the dense route tests continue to require original gates.
- Phase 6 follow-up report `tmp/hosted-play-level20-20260630-101426.json`
  kept the correct five-client party and had no hosted or WebSocket errors, but
  recorded player deaths near Old Greyjaw and the Mudfin lake route. The common
  failure was a fragile non-tank member staying in ordinary combat or quest
  brain behavior while critically low.
- `server/ambient_bots/group_support.ts` now adds a self-preservation decision
  before focus fire for non-tank members at dangerous health. The decision can
  use the best healing potion in inventory, stop auto attack, clear the target,
  and travel toward the tank or leader.
- `tests/hosted_play_party.test.ts` covers a low-health hosted mage being hit by
  a mob and choosing recovery commands plus party-anchor travel instead of
  continuing focus fire.
- A follow-up 20-level run reached about 16 minutes with a clean five-client
  party, no deaths, no hosted or WebSocket errors, and max stuck resets 0, but
  exposed repeated healing-potion cooldown errors from the new self-preservation
  path.
- `server/ambient_bots/group_support.ts` now uses a 60 second command cooldown
  for self-preservation healing potions.
- `tests/hosted_play_party.test.ts` covers the same low-health hosted mage not
  retrying the potion command 3 seconds later.

## Phase 5 Validation

- `node --check scripts/hosted_play_live_harness.mjs`: passed.
- `npx vitest run tests/hosted_play_runtime.test.ts`: passed, 16 tests.
- `npx vitest run tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts`: passed, 5 files and 184 tests.
- `git diff --check`: passed with line-ending warnings only for edited TS files.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- `node scripts/online_lan.mjs urls`: printed LAN/IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Ports `5173` and `8787` listen on `0.0.0.0`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after the final restart. The report was `tmp/hosted-play-live-harness-2026-06-29T17-56-38-671Z.json`; it reached party size 5, observed 4 invites accepted, 157 party chat messages, quest state on all 5 party members, support and combat signals, 0 player deaths, 0 hosted runtime errors, and max stuck resets 3.

## Phase 6 Validation

- `npx vitest run tests\ambient_player_bot_party_chat.test.ts`: passed, 1 file and 9 tests.
- `npx vitest run tests\ambient_player_bot_party_chat.test.ts tests\hosted_play_runtime.test.ts`: passed, 2 files and 25 tests.
- `git diff --check`: passed with line-ending warnings only for edited TS files.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 186 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T18-20-29-961Z.json`; it reached party size 5, observed 4 invites accepted, 15 party-chat events, quest state on all 5 party members, support and combat signals, 0 player deaths, 0 hosted runtime errors, and max stuck resets 1. No chat-rate or chat-lock errors were recorded.
- `npx vitest run tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\hosted_play_runtime.test.ts`: passed, 3 files and 161 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 187 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the external-progress fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T18-35-42-359Z.json`; it reached party size 5, observed 4 invites accepted, 12 party-chat events, quest state on all 5 party members, support and combat signals, 0 player deaths, 0 hosted runtime errors, and max stuck resets 0.
- `npx vitest run tests\hosted_play_runtime.test.ts`: passed, 1 file and 17 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 188 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the self-maintenance fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T18-57-50-148Z.json`; it reached party size 5, observed 4 invites accepted, 23 party-chat events, quest state on all 5 party members, support and combat signals, 0 player deaths, 0 hosted runtime errors, and max stuck resets 0.
- `npx vitest run tests\hosted_play_party.test.ts tests\hosted_play_runtime.test.ts`: passed, 2 files and 36 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 190 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the fresh party coordinate fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T19-23-56-424Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, support or combat signals, clean runtime, and max stuck resets 0.
- `npx vitest run tests\hosted_play_party.test.ts`: passed, 1 file and 21 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 192 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the party-intent release fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T19-39-41-804Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\hosted_play_party.test.ts`: passed, 1 file and 22 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 193 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the follow travel-goal fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T20-02-20-316Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed, 1 file and 127 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 194 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the grouped route gate fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: first run after restart had clean runtime but missed enabling one helper before the 120 second gate, so it failed the all-members quest-state check.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed on rerun after the same restart. The report was `tmp/hosted-play-live-harness-2026-06-29T20-44-48-266Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\hosted_play_party.test.ts`: passed, 1 file and 23 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 195 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the follower preparation priority fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-29T22-11-31-866Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\hosted_play_party.test.ts`: failed before the range-cap fix with the new 76-yard follower regression test, proving the level 5 live-run soft lock.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the range-cap fix, 1 file and 24 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 196 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the range-cap fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: first run after restart had clean runtime but missed the all-members quest-state gate inside 120 seconds.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed on immediate rerun after the same restart. The report was `tmp/hosted-play-live-harness-2026-06-29T23-07-43-580Z.json`; it observed hosted invite, party target size, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `node --check scripts\hosted_play_live_harness.mjs`: passed after the current-party harness gate fix.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed with the new all-clients-currently-see-target-party gate. The report was `tmp/hosted-play-live-harness-2026-06-29T23-24-13-857Z.json`; it observed hosted invite, party target size, every client currently seeing the target party, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: failed before the dense-route gate fix with a level 5 party entering `collect_supplies`, proving the supplies-camp early-entry bug.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the dense-route gate fix, 1 file and 128 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 197 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the dense-route gate fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-30T00-29-01-477Z.json`; it observed hosted invite, party target size, every client currently seeing the target party, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the non-ambient invite priority fix, 1 file and 25 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 198 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the grind fallback route fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-30T01-37-15-385Z.json`; it observed hosted invite, party target size, every client currently seeing the target party, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  full-party route gate bonus fix, 1 file and 129 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 199 tests.
- `npm run build:server`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the full-party route gate bonus fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-30T02-11-47-751Z.json`; it observed hosted invite, party target size, every client currently seeing the target party, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets within limit.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the non-ambient invite priority fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls` printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`: passed after restart. The report was `tmp/hosted-play-live-harness-2026-06-30T00-44-26-769Z.json`; it observed hosted invite, party target size, every client currently seeing the same 5 new clients in party, party chat, party intent and roles, cooperation mode, quest signals, all party members touching quest state, support or combat signals, clean runtime, and stuck resets 0.
- `node --check scripts\hosted_play_live_harness.mjs`: passed after the
  player-death diagnostics fix.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  grind fallback route fix, 1 file and 128 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed, 5 files and 198 tests.
- `npm run build:server`: passed.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the
  low-health self-preservation fix, 1 file and 26 tests.
- `npx vitest run tests\ambient_player_bot_group.test.ts`: passed after the
  low-health self-preservation fix, 1 file and 19 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the low-health self-preservation fix, 5 files and 200 tests.
- `git diff --check`: passed after the low-health self-preservation fix with
  line-ending warnings only for edited files.
- `npm run build:server`: passed after the low-health self-preservation fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the low-health self-preservation fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T03-06-19-490Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the potion
  cooldown fix, 1 file and 26 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the potion cooldown fix, 5 files and 200 tests.
- `git diff --check`: passed after the potion cooldown fix with line-ending
  warnings only for edited files.
- `npm run build:server`: passed after the potion cooldown fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the potion cooldown fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T03-29-37-569Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  distant Fenbridge pickup gate fix, 1 file and 130 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the distant Fenbridge pickup gate fix, 5 files and 201 tests.
- `npm run build:server`: passed after the distant Fenbridge pickup gate fix.
- `git diff --check`: passed after the distant Fenbridge pickup gate fix with
  line-ending warnings only for edited files.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the distant Fenbridge pickup gate fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T04-17-19-755Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- `node --check scripts\hosted_play_live_harness.mjs`: passed after the
  hosted-status poll retry fix.
- `git diff --check -- scripts\hosted_play_live_harness.mjs`: passed after the
  hosted-status poll retry fix with line-ending warnings only.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after the hosted-status poll retry fix. The report was
  `tmp/hosted-play-live-harness-2026-06-30T04-28-25-067Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, stuck resets
  within limit, and `statusPollErrors=0`.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  level 4 emergency retreat fix, 1 file and 131 tests.
- `node --check scripts\hosted_play_live_harness.mjs`: passed after the player
  death de-duplication fix.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the level 4 emergency retreat fix, 5 files and 202 tests.
- `npm run build:server`: passed after the level 4 emergency retreat fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the level 4 emergency retreat fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T05-11-24-049Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, stuck resets
  within limit, no deaths, and `statusPollErrors=0`.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  single-threat emergency threshold increase to 45 percent, 1 file and 131
  tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the single-threat emergency threshold increase, 5 files and 202 tests.
- `npm run build:server`: passed after the single-threat emergency threshold
  increase.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the single-threat emergency threshold increase.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T05-51-19-202Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, stuck resets
  within limit, no deaths, and `statusPollErrors=0`.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  full-party route gate rollback and Greyjaw level 5 gate, 1 file and 131
  tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the full-party route gate rollback, 5 files and 202 tests.
- `npm run build:server`: passed after the full-party route gate rollback.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the full-party route gate rollback.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T06-32-26-730Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, stuck resets
  within limit, and no deaths.
- Final-run attempt `tmp/hosted-play-level20-20260630-143908.json` was stopped
  at about 24 minutes because a level 4 full-party member selected
  `hunt_greyjaw`. The route had a level 5 base gate, but the one-level party
  bonus lowered it back to 4.
- `server/ambient_bots/progression_routes.ts` now marks `q_greyjaw` with
  `allowPartyLevelBonus: false` so the route waits until level 5 even in a full
  party.
- `tests/ambient_player_bot_brain.test.ts` covers a level 4 full party with
  `q_greyjaw` active staying on Webwood grind instead of pursuing Old Greyjaw.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  Greyjaw party-bonus opt-out, 1 file and 132 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the Greyjaw party-bonus opt-out, 5 files and 203 tests.
- `npm run build:server`: passed after the Greyjaw party-bonus opt-out.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the Greyjaw party-bonus opt-out.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T07-07-57-024Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-151234.json` reached
  level 7 with no hosted, WebSocket, or status-poll errors, and confirmed
  `greyjawObjectivesBelowLevel5=0`, but failed with 11 player deaths around
  level 6 to 7. Samples showed `recovery/recover` intent active while members
  still resumed ordinary `collect_supplies`, `combat`, or restock brain work
  and split away from critical teammates.
- `server/hosted_play/party.ts` now pauses ordinary brain drive during party
  recovery when no higher-priority support action is available. The recovery
  pause can stop attack, clear the hostile target, and travel to a stable party
  anchor instead of continuing quest collection.
- `tests/hosted_play_party.test.ts` covers a hosted member pausing ordinary
  brain work while another party member is critical.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the recovery
  hard-pause fix, 1 file and 27 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the recovery hard-pause fix, 5 files and 204 tests.
- `npm run build:server`: passed after the recovery hard-pause fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the recovery hard-pause fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T08-37-40-545Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-164236.json` failed early
  with Corda dying at level 2. The timeline showed recovery intent active, but
  the mage dropped from about 70 percent health to near zero in roughly 20
  seconds, so self-preservation needed to trigger before critical health.
- `server/ambient_bots/group_support.ts` now starts non-tank self-preservation
  at 72 percent health during party combat and starts potion use at 65 percent.
- `tests/hosted_play_party.test.ts` covers a wounded hosted damage dealer
  recovering before becoming critical.
- `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_group.test.ts`:
  passed after the earlier self-preservation fix, 2 files and 47 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the earlier self-preservation fix, 5 files and 205 tests.
- `npm run build:server`: passed after the earlier self-preservation fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`: passed after the earlier self-preservation fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T08-54-55-735Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-165949.json` reached
  level 7, party size 5, max quest done 11, 1547 party chat messages, 2140
  heal events, 24927 cast events, no stuck resets, and no hosted, WebSocket, or
  status errors. It failed acceptance because there were 8 player deaths.
  Death samples showed recovery intent active, but stable damage dealers still
  entered combat while other members were critical or dead.
- `server/ambient_bots/group_support.ts` now accepts `suppressFocusFire`.
  Hosted party recovery passes that flag while any party member is dead or at
  or below the recovery threshold, so normal damage-dealer focus fire cannot
  preempt the recovery pause. Healing, self-preservation, and tank protection
  still get first chance to act.
- `server/hosted_play/party.ts` now skips hosted self-preparation while party
  recovery is active and falls through to the recovery pause when no safe
  support action is available.
- `tests/hosted_play_party.test.ts` covers a healthy hosted mage stopping
  attack and clearing target instead of focus firing while a party priest is
  critical.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the recovery
  focus-suppression fix, 1 file and 29 tests.
- `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_group.test.ts`:
  passed after the recovery focus-suppression fix, 2 files and 48 tests.
- `npx vitest run tests\ambient_player_bot_brain.test.ts`: passed after the
  recovery focus-suppression fix, 1 file and 132 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the recovery focus-suppression fix, 5 files and 206 tests.
- `npm run build:server`: passed after the recovery focus-suppression fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the recovery focus-suppression fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T10-30-40-509Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-183604.json` reached
  level 3, party size 5, max quest log 5, max quest done 2, no stuck resets,
  and no hosted, WebSocket, or status errors. It failed acceptance because
  Corda and Brana died. Samples showed recovery intent active at the deaths,
  but the recovery trigger still waited until about 45 percent health and a
  distant healer could keep local combat or restock brain during correction
  before recovery fully took over.
- `server/hosted_play/party.ts` now starts party recovery at 72 percent health,
  uses available healing potions below 65 percent directly from the party
  recovery path, and returns distant followers to the leader during regroup
  intent before ordinary support or combat can continue.
- `tests/hosted_play_party.test.ts` covers early recovery at 70 percent team
  health, direct recovery-potion use, and in-combat follower return during
  regroup correction.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the early
  recovery and regroup-return fix, 1 file and 32 tests.
- `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_brain.test.ts`: passed after the early recovery and regroup-return fix, 3 files and 183 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the early recovery and regroup-return fix, 2 files and 26 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the early recovery and regroup-return fix, 5 files and 209 tests.
- `npm run build:server`: passed after the early recovery and regroup-return
  fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the early recovery and regroup-return fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T11-00-03-907Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-190448.json` failed at
  level 1 when Aldric died at 3 health. Samples showed `recovery/recover`
  intent active, but because Aldric was the low-health local leader, support or
  preparation commands could still run before the normal recovery pause.
- `server/hosted_play/party.ts` now lets urgent local recovery preempt support
  coordination when the local hosted member is at or below the recovery
  threshold. That path can use a healing potion, stop attack, clear target, and
  move to a recovery anchor before tank support, preparation, or offense runs.
- `tests/hosted_play_party.test.ts` covers a low-health hosted warrior leader
  recovering before tank support or preparation commands.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the urgent
  self-recovery priority fix, 1 file and 33 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`: passed after the urgent self-recovery priority fix, 5 files and 210 tests.
- `npm run build:server`: passed after the urgent self-recovery priority fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the urgent self-recovery priority fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T11-10-17-012Z.json`; it observed
  hosted invite, party target size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-191457.json` failed
  around level 2 with Aldric and Brana deaths. The party was full and recovery
  intent was active, but low-health members stayed too loose around danger.
- `server/hosted_play/party.ts` now tightens hosted recovery-anchor travel from
  8 yards to 4 yards. When the local hosted leader is wounded, recovery first
  prefers a stable healer anchor before falling back to a closer non-healer or
  any other alive member.
- `tests/hosted_play_party.test.ts` covers the new 4-yard recovery range and a
  wounded leader choosing a stable priest over a closer rogue during recovery.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the tight
  recovery-anchor fix, 1 file and 34 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the tight recovery-anchor fix, 5 files and 211 tests.
- `npm run build:server`: passed after the tight recovery-anchor fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the tight recovery-anchor fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T11-29-43-962Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-193345.json` failed
  around level 2 with Corda and Darian deaths. The party was full and recovery
  intent was active. Samples showed low-health members were within the standard
  4-yard recovery anchor and therefore stopped moving while still taking damage.
- `server/hosted_play/party.ts` now keeps the 4-yard recovery anchor for
  ordinary party recovery, but uses a tighter 1.5-yard urgent recovery anchor
  when the local hosted member is itself at or below the recovery threshold.
- `tests/hosted_play_party.test.ts` covers a wounded member at 3.5 yards from
  the anchor continuing to move instead of treating the loose formation as safe.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the urgent
  recovery-anchor fix, 1 file and 35 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the urgent recovery-anchor fix, 5 files and 212 tests.
- `npm run build:server`: passed after the urgent recovery-anchor fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the urgent recovery-anchor fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- Short live harness initially failed before gameplay because the previous
  fixed test name `Brana` was rejected by the server name filter.
- `scripts/hosted_play_live_harness.mjs` now uses safer fixed labels and a
  consonant-only unique suffix so repeated validation runs avoid accidental
  offensive-name matches.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after the harness-name fix. The report was
  `tmp/hosted-play-live-harness-2026-06-30T11-49-22-318Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Final-run attempt `tmp/hosted-play-level20-20260630-195329.json` failed
  around level 2 when Mira died after fleeing toward the recovery anchor. The
  1.5-yard urgent recovery movement worked, but because urgent movement ran
  before support, a wounded priest could not first cast an urgent self-heal.
- `server/hosted_play/party.ts` now lets healer-capable hosted members use a
  narrow urgent self-heal or shield support decision before movement recovery
  when they are themselves at or below the recovery threshold. The gate only
  accepts `heal_party` or `shield_party` decisions that actually cast, so
  preparation, tanking, support setup, and offense still cannot preempt
  self-preservation.
- `tests/hosted_play_party.test.ts` covers a wounded hosted priest casting
  `lesser_heal` on itself before fleeing.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the urgent
  self-heal fix, 1 file and 36 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the urgent self-heal fix, 5 files and 213 tests.
- `npm run build:server`: passed after the urgent self-heal fix.
- Short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T12-05-24-660Z.json` failed because
  Alden and Liora died while already in recovery. Samples showed they had moved
  into the recovery cluster, but were still being hit by nearby active threats.
- `server/hosted_play/party.ts` now computes a retreat point beyond the current
  recovery anchor and away from the nearest nearby mob that is still targeting
  the low-health local member.
- `tests/hosted_play_party.test.ts` covers a wounded member within the urgent
  recovery anchor still retreating past the anchor while being attacked.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the threatened
  retreat fix, 1 file and 37 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the threatened retreat fix, 5 files and 214 tests.
- `npm run build:server`: passed after the threatened retreat fix.
- Short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T12-14-56-982Z.json` still failed
  because Alden died during recovery. Samples showed healthy damage dealers were
  not allowed to finish the mob actively killing a low-health tank while focus
  fire was globally suppressed for recovery.
- `server/ambient_bots/group_support.ts` now allows protective focus fire
  during recovery only against mobs actively attacking low-health party members.
  Ordinary focus fire remains suppressed during recovery.
- `tests/hosted_play_party.test.ts` covers a healthy mage protectively focusing
  the mob attacking a critical priest during hosted party recovery.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the protective
  recovery focus fix, 1 file and 38 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the protective recovery focus fix, 5 files and 215 tests.
- `npm run build:server`: passed after the protective recovery focus fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the protective recovery focus fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after restart. The report was
  `tmp/hosted-play-live-harness-2026-06-30T12-26-47-398Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- The next level 20 candidate,
  `tmp/hosted-play-level20-20260630-203014.json`, was stopped after a backend
  strategy change. It had a full party, no deaths, and no hosted or WebSocket
  errors, but by about 23.5 minutes it was only level 3 to 4 and members were
  often split across separate local fights and objectives.
- `server/hosted_play/party.ts` now treats followers more than 18 yards from
  the leader as out of tight formation. A follower already in combat at that
  range stops attacking, clears its target, and travels back to the leader
  before ordinary local fighting continues.
- `server/ambient_bots/party_intent.ts` uses the same 18-yard threshold for
  correction intent, so party chat and behavior describe the same regroup rule.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after the tight
  formation fix, 1 file and 39 tests.
- `npx vitest run tests\ambient_player_bot_party_chat.test.ts`: passed after
  the tight formation fix, 1 file and 10 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the tight formation fix, 5 files and 217 tests.
- `npm run build:server`: passed after the tight formation fix.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the tight formation fix.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs after the restart.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon` after
  the restart.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after the tight formation fix. The report was
  `tmp/hosted-play-live-harness-2026-06-30T13-00-44-250Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- The next level 20 candidate,
  `tmp/hosted-play-level20-20260630-210322.json`, was stopped after about 25.6
  minutes with a full party, no deaths, no hosted errors, no WebSocket errors,
  and no status errors. It exposed a quest sync gap instead of a survival
  issue: Alden and Tovin had finished wolves, boars, and spiders, while Mira
  and Liora were still active on boars and spiders and were being pulled toward
  the leader's later route.
- `server/hosted_play/runtime.ts` now allows a tight grouped follower to keep
  driving its own accepted local quest objective while follow movement is
  paused. The gate requires an accepted quest objective, no more than 18 yards
  from the leader, and any travel target within the local 24-yard quest
  override range.
- `tests/hosted_play_runtime.test.ts` covers a grouped mage follower staying
  close to the leader while targeting, casting, and attacking a local boar for
  its own active quest instead of issuing `/follow`.
- `npx vitest run tests\hosted_play_runtime.test.ts`: passed after the local
  active quest override, 1 file and 18 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts`:
  passed after the local active quest override, 5 files and 218 tests.
- `npm run build:server`: passed after the local active quest override.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after the local active quest override.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs after the restart.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon` after
  the restart.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after the local active quest override. The report was
  `tmp/hosted-play-live-harness-2026-06-30T13-34-19-062Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- The next level 20 candidate,
  `tmp/hosted-play-level20-20260630-213929.json`, was stopped after about 28.6
  minutes with a full party, no deaths, no hosted errors, no WebSocket errors,
  and no status errors. It exposed an early collection sync gap: Alden had
  finished `q_boars`, while Mira, Corin, Tovin, and Liora were still active on
  `q_boars` and short on `boar_hide` drops.
- `src/world_api.ts` added optional `qlog` and `qdone` fields to
  `PartyMemberInfo`.
- `src/sim/sim.ts` now fills those fields in `partyInfo` member snapshots from
  each member's `PlayerMeta`.
- `server/ambient_bots/brain.ts` now parses party member quest state and uses
  party backfill before the bot continues its own later active quest route.
- `tests/social.test.ts` covers party snapshots carrying member quest state.
- `tests/ambient_player_bot_brain.test.ts` covers helping a party member with
  an earlier active `q_boars` route and routing to the earlier ready turn-in.
- `npx vitest run tests\ambient_player_bot_brain.test.ts tests\social.test.ts`:
  passed after party quest backfill, 2 files and 176 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`:
  passed after party quest backfill, 6 files and 262 tests.
- `npm run build:server`: passed after party quest backfill.
- `npx tsc --noEmit`: failed on existing unrelated type errors in
  `server/ai/active_triggers.ts`, `server/ambient_bots/social.ts`,
  `server/game.ts`, `server/hosted_play/party.ts`, generated locale outputs,
  and `tests/auto_loot.test.ts`. The focused server bundle still passes.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after party quest backfill.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs after the restart.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon` after
  the restart.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after party quest backfill. The report was
  `tmp/hosted-play-live-harness-2026-06-30T14-25-44-997Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Level 20 candidate `tmp/hosted-play-level20-20260630-222842.json` was stopped
  after Miraj died at about 13.1 minutes. Status samples showed recovery intent
  was active, but the low-level priest still relied on hard-cast self healing
  while under threat.
- `server/hosted_play/party.ts` now lets urgent self recovery run before healer
  self-cast support, so threatened low-health healers stop attacking, clear
  target, and retreat.
- `tests/hosted_play_party.test.ts` now covers a wounded hosted priest
  retreating instead of hard-casting under threat.
- `npx vitest run tests\hosted_play_party.test.ts`: passed after healer
  recovery hardening, 1 file and 39 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`:
  passed after healer recovery hardening, 6 files and 262 tests.
- `npm run build:server`: passed after healer recovery hardening.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after healer recovery hardening.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs after the restart.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon` after
  the restart.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after healer recovery hardening. The report was
  `tmp/hosted-play-live-harness-2026-06-30T14-50-36-383Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- Level 20 candidate `tmp/hosted-play-level20-20260630-225342.json` was stopped
  after about 23 minutes with a full party, no deaths, no hosted errors, no
  WebSocket errors, and no status errors. Database inspection showed Alden had
  completed `q_boars` and `q_spiders`, while the rest of the party still had
  `q_boars` active at 3 to 4 hides. The party was correctly backfilling
  `hunt_boars`, but follow and regroup pauses could still suppress nearby
  corpse `loot` commands.
- `server/hosted_play/runtime.ts` now lets a tight grouped follower run nearby
  `loot` brain commands while follow, regroup, or preparation has paused
  ordinary brain drive.
- `tests/hosted_play_runtime.test.ts` now covers a tight follower looting a
  personal `boar_hide` corpse before resuming follow.
- `npx vitest run tests\hosted_play_runtime.test.ts`: passed after local loot
  override, 1 file and 19 tests.
- `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`:
  passed after local loot override, 6 files and 263 tests.
- `npm run build:server`: passed after local loot override.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`:
  passed after local loot override.
- Ports `5173` and `8787` listen on `0.0.0.0`; `node scripts\online_lan.mjs urls`
  printed the IP game and server URLs after the restart.
- `http://127.0.0.1:8787/api/status`: returned ok for realm `Claudemoon` after
  the restart.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`:
  passed after local loot override. The report was
  `tmp/hosted-play-live-harness-2026-06-30T15-22-10-342Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.

### Recent Phase 6 Checkpoints

- `tmp/hosted-play-level20-20260701-000540.json` exposed that online hosted
  party wire lacked member quest state. `GameServer.partyWire()` now includes
  `qlog` and `qdone`, with a hosted live-state seam test.
- `tmp/hosted-play-level20-20260701-003111.json` exposed a level 2 mage dying
  before ordinary recovery thresholds. Low-level fragile mage, priest, and
  warlock members under direct aggro now self-preserve below 90 percent health
  and may use potions at 72 percent.
- `tmp/hosted-play-level20-20260701-010039.json` stayed clean through level 5
  but showed slow grind selection. Full nearby level 5 parties that completed
  `q_murlocs` now grind Mudfin Skulkers while waiting for level 6 dense-route
  gates.
- `tmp/hosted-play-live-harness-2026-06-30T18-19-50-394Z.json` failed because
  Corin, a level 1 mage, died during a recovery intent window. Hosted party
  recovery now treats active recovery intent as a hard self-preservation signal
  for level 4 and below mage, priest, and warlock members below 90 percent
  health, even without an explicit direct-aggro snapshot.
- Ambient group support now checks self-preservation before hard-cast party
  healing so a threatened wounded healer retreats before trying to cast under
  pressure.
- Latest focused validation after the recovery-intent fix:
  `npx vitest run tests\hosted_play_party.test.ts tests\ambient_player_bot_group.test.ts`,
  the 7-file hosted, brain, group, chat, game-server, and social regression,
  `git diff --check`, `npm run build:server`, LAN/IP restart through
  `scripts/windows_stack.ps1`, `0.0.0.0` port verification, printed IP URLs,
  `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T18-33-58-431Z.json` all passed.
- `tmp/hosted-play-level20-20260701-023827.json` stayed full-party and
  death-free through level 5 and the murloc turn-in, then failed during Mudfin
  grind when Alden, the warrior leader, died once under sustained direct aggro.
  The ordinary 72 percent self-recovery threshold was too late for that
  frontline tank window.
- Latest focused validation after the frontline direct-threat fix:
  `npx vitest run tests\hosted_play_party.test.ts`, the 7-file hosted, brain,
  group, chat, game-server, and social regression, `git diff --check`,
  `npm run build:server`, LAN/IP restart through `scripts/windows_stack.ps1`,
  `0.0.0.0` port verification, printed IP URLs, `/api/status`, and short live
  harness report `tmp/hosted-play-live-harness-2026-06-30T19-36-31-774Z.json`
  all passed.
- `tmp/hosted-play-level20-20260701-033916.json` was stopped at about 78
  minutes after a clean full-party run reached level 6, accepted supplies and
  mine work, and survived a ringleader recovery window. The blocker was invalid
  collect backfill: members who had already completed or did not hold
  `q_supplies` kept clicking supply crates for a teammate and received repeated
  `The crate is nailed shut.` errors while quest-event progress stayed flat.
- Latest focused validation after the collect-backfill escort fix:
  `npx vitest run tests\ambient_player_bot_brain.test.ts`, the 7-file hosted,
  brain, group, chat, game-server, and social regression, `git diff --check`,
  `npm run build:server`, LAN/IP restart through `scripts/windows_stack.ps1`,
  `0.0.0.0` port verification, printed IP URLs, `/api/status`, and short live
  harness report `tmp/hosted-play-live-harness-2026-06-30T21-06-22-045Z.json`
  all passed.
- `tmp/hosted-play-level20-20260701-051040.json` reached level 6 with full
  party and no collect-spam regression, but failed clean runtime during the
  Mudfin and restock transition. The death window showed recovery intent
  falling back to focus or buffs while party members were still below the
  hosted recovery threshold, and the runtime could still allow nearby restock
  or preparation-style brain work during a recovery pause.
- Hosted recovery pauses without a movement target now report `recover_party`
  instead of `prepare_party`. This state is intentionally not a self-maintenance
  override, so restock, buy, local quest, and ordinary brain work stay paused
  until recovery clears.
- Party intent now treats any member at or below the hosted 72 percent recovery
  line as recovery, aligning party chat with the behavior gate. Group support
  also skips non-healing preparation while recovery suppresses focus fire.
- Focused validation after the recovery hard-pause fix:
  `npx vitest run tests\hosted_play_party.test.ts tests\hosted_play_runtime.test.ts tests\ambient_player_bot_party_chat.test.ts`
  passed before the broader validation pass.
- Broader validation after the recovery hard-pause fix also passed:
  `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\hosted_play_game_server.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`,
  `node scripts\i18n_resolved_hash.mjs --check`, `git diff --check`,
  `npm run build:server`, and `npm run build`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`
  passed after the recovery hard-pause fix. Ports `5173` and `8787` listened
  on `0.0.0.0`, `node scripts\online_lan.mjs urls` printed IP game and server
  URLs, and `http://127.0.0.1:8787/api/status` returned ok for realm
  `Claudemoon`.
- `node scripts\hosted_play_live_harness.mjs --duration-ms=120000 --sample-ms=2000`
  passed after the recovery hard-pause fix. The report was
  `tmp/hosted-play-live-harness-2026-06-30T22-36-21-740Z.json`; it observed
  hosted invite, target party size, current full-party agreement, party chat,
  party intent and roles, cooperation mode, quest signals, all party members
  touching quest state, support or combat signals, clean runtime, and stuck
  resets within limit.
- `tmp\hosted-play-level20-20260701-063937.json` reached a full five-player
  party but failed around level 2 with six player deaths. Recovery intent was
  active, but several members still showed combat, restock, loot, target, cast,
  and attack behavior while multiple party members were below a stable recovery
  line.
- Recovery stabilization now holds active recovery intent until all living
  members exceed about 90 percent health. During recovery, support allows only
  healing, self-preservation, taunt or growl protection, and a narrow protective
  focus case with one unstable non-self target. Runtime debug commands now show
  the effective commands allowed by the party coordinator.
- Latest focused validation after the recovery stabilization fix:
  `npx vitest run tests\hosted_play_party.test.ts tests\hosted_play_runtime.test.ts tests\ambient_player_bot_group.test.ts`
  passed.
- Latest broader validation after the recovery stabilization fix:
  `npx vitest run tests\hosted_play_runtime.test.ts tests\hosted_play_party.test.ts tests\hosted_play_game_server.test.ts tests\ambient_player_bot_brain.test.ts tests\ambient_player_bot_group.test.ts tests\ambient_player_bot_party_chat.test.ts tests\social.test.ts`
  passed.
- Recovery stabilization was also covered by `git diff --check`,
  `npm run build:server`, `npm run build`, LAN/IP restart through
  `scripts\windows_stack.ps1`, `0.0.0.0` port verification, printed IP URLs,
  `/api/status`, and short live harness report
  `tmp/hosted-play-live-harness-2026-06-30T23-07-38-590Z.json`. The short run
  reached the target five-player party, observed invite, chat, intent, quest,
  and support signals, stayed runtime-clean, and had zero player deaths.

## Validation Matrix

### Docs Only

- `git status --short`
- optional spell and link review by file inspection

### Hosted Backend Behavior

- `npx vitest run tests/hosted_play_party.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_api.test.ts tests/hosted_play_game_server.test.ts`
- `npm run build:server`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`
- `node scripts/online_lan.mjs urls`
- `/api/status` through `http://127.0.0.1:8787/api/status`

### Quest Brain

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/hosted_play_runtime.test.ts`
- Add focused route tests before changing behavior.

### Party Chat And Social Text

- `npx vitest run tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_runtime.test.ts`
- `npx vitest run tests/localization_fixes.test.ts` if player-visible emits or
  UI strings change.

### Support Roles

- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_party.test.ts`

### Live Harness

- `npm run db:up`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`
- harness command added in Phase 5
- verify generated artifact

### Final Gate

- One clean live hosted run to level 20 after the final code change.
- Then run the targeted test set plus `npm run build:server`.

## Known Current Gaps

- A clean post-fix level 20 hosted run is still required after the latest
  recovery stabilization fix, service restart, and short live harness check.

## New Files In This Packet

- `docs/hosted-party-autonomy/README.md`
- `docs/hosted-party-autonomy/requirements.md`
- `docs/hosted-party-autonomy/brainstorm.md`
- `docs/hosted-party-autonomy/design.md`
- `docs/hosted-party-autonomy/implementation-plan.md`
- `docs/hosted-party-autonomy/progress.md`
- `docs/hosted-party-autonomy/state.md`
- `docs/hosted-party-autonomy/qa-checklist.md`
- `docs/hosted-party-autonomy/phase-01-party-defaults.md`
- `docs/hosted-party-autonomy/phase-01-qa.md`
- `docs/hosted-party-autonomy/phase-02-quest-intake.md`
- `docs/hosted-party-autonomy/phase-02-qa.md`
- `docs/hosted-party-autonomy/phase-03-party-chat.md`
- `docs/hosted-party-autonomy/phase-03-qa.md`
- `docs/hosted-party-autonomy/phase-04-support-roles.md`
- `docs/hosted-party-autonomy/phase-04-qa.md`
- `docs/hosted-party-autonomy/phase-05-live-harness.md`
- `docs/hosted-party-autonomy/phase-05-qa.md`
- `docs/hosted-party-autonomy/phase-06-level-20-run.md`
- `docs/hosted-party-autonomy/phase-06-qa.md`

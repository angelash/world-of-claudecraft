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
- Nearby alive party members lower route pursuit gates by up to two levels.
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
- Grouped quest route gates now use a conservative party-level check. A group
  can reduce a route by at most one level, and every nearby contributing party
  member must meet that grouped safe level.
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

- A clean post-fix level 20 hosted run is still required after the dense-route
  gate fix and service restart.

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

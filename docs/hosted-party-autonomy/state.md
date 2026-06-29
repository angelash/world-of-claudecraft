# State: Hosted Party Autonomy

## Current Phase

Phase 4 implementation complete. Phase 4 QA is next.

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

- Phase 4 still needs deeper support-role validation across buffs, healing,
  tanking, focus fire, regrouping, and recovery combinations.
- The live harness still needs to prove invites, party size, chat, support,
  quests, deaths, and progression against the persistent LAN/IP stack.
- No dedicated long-run hosted-play harness currently proves level 1 to 20.

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

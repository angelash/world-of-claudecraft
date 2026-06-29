# State: Hosted Party Autonomy

## Current Phase

Planning packet in progress.

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

- Hosted defaults are still solo-oriented.
- Auto invite exists but is off by default and defaults to target size 2.
- Hosted party chat is currently gated by `follow_leader` and inherits ambient
  behavior that was designed mainly for ambient-led parties.
- The ambient quest brain chooses one route at a time and does not yet perform a
  hosted-specific local pickup sweep.
- Party strength does not yet lower pursuit thresholds through explicit scoring.
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

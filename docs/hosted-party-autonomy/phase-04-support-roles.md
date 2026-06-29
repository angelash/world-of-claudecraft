# Phase 4: Cooperative Support Roles

## Goal

Polish hosted party support so buffs, healing, tanking, focus fire, regrouping,
and recovery are visibly reliable during the level 1 to 20 run.

## Source Context

Read:

- `server/ambient_bots/group_support.ts`
- `server/ambient_bots/pre_combat.ts`
- `server/ambient_bots/party_roles.ts`
- `server/hosted_play/party.ts`
- `tests/ambient_player_bot_group.test.ts`
- `tests/hosted_play_party.test.ts`

## Deliverables

- Fill support gaps discovered by hosted-party validation.
- Keep opening attacks from being suppressed by brain-drive pause.
- Add tests for the class mix used in the live run.
- Ensure support actions happen through normal commands.

## Validation

Run:

```powershell
npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_party.test.ts
npm run build:server
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
```

## Commit

Use:

```text
fix(hosted-play): polish cooperative support roles
```

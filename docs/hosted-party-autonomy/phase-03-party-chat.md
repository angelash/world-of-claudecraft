# Phase 3: Hosted Party Chat And Behavior Intent

## Goal

Make hosted parties sound alive and make their chat affect behavior through a
bounded intent layer.

## Source Context

Read:

- `server/ambient_bots/party_chat.ts`
- `server/ambient_bots/party_roles.ts`
- `server/ambient_bots/group_support.ts`
- `server/hosted_play/runtime.ts`
- `server/hosted_play/party.ts`
- `tests/ambient_player_bot_party_chat.test.ts`
- `tests/hosted_play_runtime.test.ts`

## Deliverables

- Extend hosted party chat so hosted-led parties can brief and members can ack.
- Add template categories for route plans, buffs, focus, praise, correction, and
  recovery.
- Add a validated intent object for behavior layers.
- Consume intent in party or quest layers without parsing free-form chat.
- Add tests that chat lines and behavior intent stay aligned.

## Validation

Run:

```powershell
npx vitest run tests/ambient_player_bot_party_chat.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_party.test.ts
npm run build:server
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
```

Run the localization guard if new player-visible text crosses a server or UI
boundary.

## Commit

Use:

```text
feat(hosted-play): couple party chat to group intent
```

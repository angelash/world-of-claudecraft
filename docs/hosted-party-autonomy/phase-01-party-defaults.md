# Phase 1: Party-Fill Defaults

## Goal

Make cooperative party fill the default hosted-play posture and harden the
nearby invite loop so a hosted character reliably invites visible players until
the configured target is reached.

## Source Context

Read:

- `server/hosted_play/types.ts`
- `server/hosted_play/runtime.ts`
- `server/hosted_play/party.ts`
- `server/main.ts`
- `server/db.ts`
- `src/hosted_play_settings.ts`
- `src/ui/hosted_play_panel.ts`
- `tests/hosted_play_party.test.ts`
- `tests/hosted_play_runtime.test.ts`
- `tests/hosted_play_api.test.ts`

## Deliverables

- Update default hosted preferences toward cooperative full-party behavior.
- Preserve explicit saved preferences for existing characters.
- Add tests for target size 5, repeated invite cooldowns, party leader guard,
  dead guard, combat guard, full-party guard, and no-candidate guard.
- Ensure status payloads, API helpers, and UI controls still expose the chosen
  values.
- Restart the stack and verify LAN/IP URLs after backend changes.

## Validation

Run:

```powershell
npx vitest run tests/hosted_play_party.test.ts tests/hosted_play_runtime.test.ts tests/hosted_play_api.test.ts tests/hosted_play_game_server.test.ts
npm run build:server
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
node scripts/online_lan.mjs urls
```

Then verify `http://127.0.0.1:8787/api/status` returns ok.

## Commit

Use:

```text
fix(hosted-play): default to cooperative party fill
```

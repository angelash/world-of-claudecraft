# Phase 5: Live Hosted-Play Harness

## Goal

Add a repeatable live harness that verifies hosted-party behavior through the
real persistent LAN/IP stack.

## Source Context

Read:

- `scripts/online_lan.mjs`
- `scripts/windows_stack.ps1`
- existing multiplayer or smoke scripts in `scripts/`
- `server/main.ts`
- `src/net/online.ts`

## Deliverables

- Add a script that can connect through the real stack and observe hosted-play
  status, party size, invite commands, chat, support actions, and quest progress.
- Ensure the script uses persistent Postgres-backed online flow.
- Emit a concise JSON or markdown artifact.
- Keep the script safe for repeated local runs.

## Validation

Run:

```powershell
npm run db:up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
node scripts/online_lan.mjs urls
```

Then run the new harness command.

## Commit

Use:

```text
test(hosted-play): add live autonomy harness
```

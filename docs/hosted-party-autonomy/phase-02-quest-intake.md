# Phase 2: Quest Intake And Group-Aware Pursuit

## Goal

Make hosted play accept all sensible nearby quests before leaving a hub, then
choose active objectives using level, route, party size, and role readiness.

## Source Context

Read:

- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`
- `server/hosted_play/runtime.ts`
- `tests/ambient_player_bot_brain.test.ts`
- `tests/hosted_play_runtime.test.ts`

## Deliverables

- Add a hosted-specific quest-intake seam that can sweep eligible local pickups.
- Keep ready turn-ins high priority when they are efficient.
- Add a group-aware pursuit score or threshold adjustment.
- Add tests for all-local-pickup behavior, accepted-but-deferred hard quests,
  grouped pursuit when party strength is enough, and solo deferral when it is
  not.

## Validation

Run:

```powershell
npx vitest run tests/ambient_player_bot_brain.test.ts tests/hosted_play_runtime.test.ts
npm run build:server
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
```

Then verify `/api/status`.

## Commit

Use:

```text
feat(hosted-play): sweep quests before grouped routing
```

# Phase 6: Level 20 Cooperative Run

## Goal

Run hosted play until one clean post-change validation reaches level 20 and
completes all practical pre-20 quests.

## Deliverables

- Start the persistent LAN/IP stack.
- Enable hosted play through the real online path.
- Fill the party to target size.
- Complete the level 1 to 20 route with quest intake, support, chat, and
  recovery visible in the artifact.
- Fix any defects found, restart after backend changes, then repeat the run.
- Stop only after the final post-fix run passes in one continuous attempt.

## Validation

Run the live harness in long-run mode. Also run:

```powershell
npx vitest run tests/hosted_play_party.test.ts tests/hosted_play_runtime.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_party_chat.test.ts
npm run build:server
```

## Commit

Use focused fix commits for any defects. Use a final test or docs commit only
if artifacts or docs need to be recorded.

# QA Checklist: Online Hosted Play

- Same-session safety:
  - enabling hosted play never creates a duplicate live session
  - disabling hosted play clears hosted movement and future automated commands
- Manual override:
  - a real player movement or command pauses hosted play
  - pause status is visible to the player
- Authority:
  - hosted play uses normal command and movement surfaces only
  - no direct sim shortcut mutates combat, loot, quest, or economy outcomes
- Online behavior:
  - a live hosted character can navigate, fight, loot, recover, and continue a
    bounded progression loop
  - the runtime stops automatically on disconnect
- UI:
  - owner controls are reachable from the game menu
  - controls are keyboard-accessible and mobile-safe
  - new player-visible strings go through `t()`
- Build and tests:
  - targeted vitest suites pass
  - `npm run build:server` passes
  - `npm run build` passes

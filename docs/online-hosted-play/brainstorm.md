# Brainstorm: Online Hosted Play

## Approved direction

- Hosted play is for a real player's live character, not a synthetic nearby
  population.
- The first shipping slice is online-only and same-session only.
- The feature should feel like "my character keeps playing while I let it" and
  not like a background account-sharing worker.

## What already exists and is reusable

### Strong reuse

- `server/ambient_bots/brain.ts`
  - already drives quest, travel, combat, loot, recovery, and vendor actions
- `server/ambient_bots/group.ts`
  - good future fit for party regroup and follow once hosted play supports group
    objectives
- `server/ambient_bots/social.ts`
  - useful future fit for friend, whisper, and presence behavior
- `server/game.ts`
  - already has the authoritative command and movement path the hosted runtime
    should reuse
- `src/ui/hud.ts`
  - already has a flexible in-game options menu for owner controls

### Weak reuse

- `server/ambient_bots/runtime.ts`
  - not a drop-in fit because it provisions and logs in separate bot accounts
- `server/ambient_bots/service.ts`
  - not a fit because it solves cluster demand, not owner-driven single-character
    lifecycle

## Risks and constraints

1. Duplicate session is a hard blocker.
   - `GameServer.join()` rejects a second live session for the same character.
   - Hosted play must attach to the current session, not create another one.

2. Manual conflict can make the feature feel broken.
   - If automation keeps holding movement after a real player acts, trust is
     lost immediately.
   - The runtime should pause on manual input and clear hosted movement.

3. Idle timeout and anti-bot assumptions need care.
   - Hosted automation should count as activity for the live player session.
   - Internal hosted actions should not accidentally trip player bot-detection
     heuristics.

4. The first slice should stay small.
   - same-session runtime
   - player enable or disable UI
   - bounded solo progression reuse
   - no persistence, no LLM, no party requirement yet

## LLM recommendations for later phases

- Keep the first hosted-play release fully heuristic.
- Add LLM only after the hosted runtime, pause rules, and player controls are
  stable.
- Good later LLM use cases:
  - whisper reply phrasing
  - friend or social stance selection
  - lightweight memory summarization
  - bounded objective explanation shown to the player
- Bad LLM use cases:
  - direct movement
  - direct combat rotation
  - authoritative quest completion decisions
  - any unchecked raw command generation

# Requirements: Online Hosted Play

## Product goal

Build a real-server hosted-play system for real player characters. A player who
is already online can enable hosted play for their current character, watch the
character continue to progress through quests and combat using the same
authoritative game systems as a human player, and interrupt or disable the
automation at any time from a first-party UI.

## Player-experience requirements

### 1. Online self-service control

- The player can enable or disable hosted play from an in-game UI.
- The same in-game UI lets the player choose whether hosted play should resume
  automatically on the next login for that character.
- The same in-game UI lets the player choose whether the hosted character stays
  in solo progression mode or shifts into a party-follow posture.
- The UI shows whether hosted play is offline, disabled, active, or blocked by
  a runtime error.
- The UI shows at least one live activity hint, such as the current objective
  or error reason.
- When party behavior is active, the UI shows enough live group context for the
  player to understand what the automation is doing, such as follow or regroup
  state and the current party leader context.
- The UI exposes a detailed diagnostic view for the current objective, recent
  commands, travel target, group state, social shell state, LLM prompt and raw
  output, and recent action log context.
- The player can turn the chat action log on or off per character.

### 2. Same-session safety

- Hosted play applies to the player's current live character session only.
- The feature must not require a second login for the same character.
- Hosted play remains online and active until the player explicitly disables it
  or the runtime enters a safety pause after an internal error.
- Player-owned controls still route through the normal server path, but normal
  user input no longer creates a hidden temporary automation pause. The explicit
  stop button is the player-facing control for ending hosted play.

### 3. Real progression

- Hosted play should reuse the real progression logic already built for ambient
  bots where it is a fit.
- The first useful slice must do more than stand still. It should be able to
  navigate, fight, loot, recover, vendor, and continue a bounded real
  progression loop.
- Progress must remain reconstructible from live world state, character state,
  and lightweight hosted runtime memory.

### 4. Online-only scope for the first shipping slice

- The first hosted-play slice may require the real character to remain online.
- The first slice does not need offline delegated play, background login
  takeover, or remote worker ownership.
- Future persistence and auto-resume may be added later, but they are not
  allowed to compromise same-session safety.

### 5. Social and LLM overlay behavior

- Hosted characters should be able to react to friend or whisper interactions
  through a bounded social shell layered on top of the hosted runtime.
- In party-follow mode, hosted characters should accept party invites, preserve
  the server follow state when near the leader, and assist party members under
  attack without taking over party leadership.
- Any LLM-assisted behavior must feel like an overlay on top of a safe,
  deterministic automation base, not a replacement for it.
- LLM assistance may shape social tone or plan summaries, but it must not gain
  direct authority over combat, movement, loot, or quest outcomes.

## Functional requirements

### A. Session binding

- Hosted play binds to a live `ClientSession` that already belongs to the real
  account and character.
- Enabling hosted play for an offline character should fail clearly.
- Hosted play must stop automatically when the live session leaves the world.

### B. Real command path

- Hosted play uses the same movement input and command surfaces that the normal
  client uses.
- Server authority remains intact. Automation may call shared server command
  helpers, but it may not mutate sim state through hidden shortcuts.
- Automation activity must count as real session activity so the idle timeout
  does not log out an actively hosted character.

### C. Automation runtime

- The runtime tracks enable or disable state, pause windows, last objective,
  last error, and recent automation activity.
- The runtime can drive a low-cost progression brain on a timer without
  allocating excessively in hot paths.
- The runtime must safely clear stale movement state when pausing or stopping.
- The runtime emits throttled action log lines when the player has enabled that
  diagnostic preference.
- The runtime exposes a bounded debug snapshot with the current brain decision,
  party overlay state, social pending replies, and LLM audit context.

### D. Party behavior

- `solo` mode does not automatically accept party invites.
- `follow_leader` mode accepts incoming party invites through the normal
  `paccept` command.
- When already grouped, the hosted party coordinator follows the party leader
  with the normal `/follow <leader>` chat path when needed.
- While server follow is active and the hosted player is already near the
  leader, hosted brain movement remains paused so automation does not break the
  follow state.
- If a visible hostile mob is attacking another party member, the hosted player
  may target that mob to let the normal combat brain assist.
- A hosted follower does not invite additional party members or override a real
  player's leadership decisions.

### E. Player control surface

- Expose owner-only REST endpoints to read hosted-play status and enable or
  disable the feature.
- Wire those endpoints into an in-game UI surface.
- The UI must remain accessible on desktop and mobile.

### F. Persistence and later lifecycle work

- Per-character hosted-play preferences should persist additively in the
  existing character schema.
- The persisted preference set includes at least login auto-resume and party
  behavior mode.
- The persisted preference set also includes whether the chat action log is
  enabled.
- Login auto-resume must remain ownership-gated and same-session safe.
- Summary runtime state may remain in memory for now as long as it can be
  reconstructed from the live session and persisted preferences.

### G. Social and LLM overlays

- Social shell and LLM behavior sit on top of the base hosted-play release.
- Model output must be structured, validated, rate-limited, audited, and unable
  to directly mutate authoritative gameplay state.

## Non-functional requirements

### Safety

- No second live session for the same character.
- Manual player input always has higher priority than automation.
- Hosted play must respect moderation, block lists, rate limits, and account
  ownership checks.

### Performance

- Reuse existing automation logic where possible instead of duplicating pathing
  and combat heuristics.
- Avoid per-tick allocations in the hosted runtime.
- Keep live status updates compact and event-driven where feasible.

### Maintainability

- Prefer focused modules under a dedicated hosted-play namespace.
- Keep `server/game.ts` changes limited to small named seams.
- Keep UI additions modular and localized through existing `t()` patterns.

## Acceptance signals

- A real online player can enable hosted play from the game menu.
- The character continues to move, fight, loot, recover, and progress using the
  real online session.
- Hosted play keeps running until disabled or blocked by a runtime error.
- Disabling hosted play stops movement and future automated commands cleanly.
- The status surface shows whether the hosted runtime is active and what it is
  trying to do.
- In follow-leader mode, hosted play accepts trusted group flow, follows the
  party leader, preserves nearby follow, and assists party members in combat.
- The detail view gives enough runtime context to debug cases such as choppy
  walking, missed loot pickup, a stuck objective, or unexpected LLM behavior.

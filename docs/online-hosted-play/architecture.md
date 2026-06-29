# Architecture: Online Hosted Play

## Design summary

Online hosted play is a same-session automation layer for real player
characters. It does not create a second WebSocket client for the same
character. Instead, it attaches a hosted runtime to the current authoritative
`ClientSession`, builds a live world view from that session, reuses the ambient
bot progression brain where possible, and feeds normal movement input and
commands back through named server integration seams.

## Core architectural decision

The server already rejects duplicate live sessions for the same character. That
means hosted play cannot be implemented as "log the same character in again from
a bot runtime". The first-party hosted runtime must stay inside the current live
session and act as a trusted automation producer for that session only.

## Component model

### 1. Player control surface

Primary files:
- `src/ui/hud.ts`
- `src/main.ts`
- `src/net/online.ts`
- `src/ui/i18n.catalog/hud_chrome.ts`

Responsibilities:
- show hosted-play status to the owner
- enable or disable hosted play
- persist owner preference changes for login resume and party behavior
- explain pause or error state
- surface current group coordination state when party behavior is enabled
- keep controls accessible on desktop and mobile

### 2. Hosted runtime

Primary files:
- `server/hosted_play/runtime.ts`
- `server/hosted_play/types.ts`
- `server/hosted_play/party.ts`
- `server/hosted_play/action_log.ts`
- `server/hosted_play/llm.ts`

Responsibilities:
- track which live characters have hosted play enabled
- tick the hosted brain on a bounded timer
- clear movement when pausing or stopping
- expose live status for API and UI use
- coordinate party invite, follow, assist, and regroup overlays before brain
  drive is applied
- emit throttled player-visible action log lines when enabled
- expose bounded debug snapshots for UI inspection
- host bounded social shell and LLM overlay state for the current live session

### 3. Preference persistence and login resume

Primary files:
- `server/db.ts`
- `server/main.ts`

Responsibilities:
- store additive hosted-play preferences on each character row
- read those preferences for status reads and enable requests
- re-enable hosted play on login only when the persisted resume policy allows it
- persist the party behavior mode and chat action log preference
- keep the ownership check on the existing authenticated character routes

### 4. GameServer integration seam

Primary files:
- `server/game.ts`

Responsibilities:
- provide named access to a live owner session
- expose a safe hosted-play live view for that session
- apply hosted movement input and commands through the same server rule path
- send hosted-play action log events to only the owning player

### 5. Shared automation core

Primary files:
- `server/ambient_bots/brain.ts`
- `server/ambient_bots/group.ts`
- later: extracted shared automation helpers if duplication appears

Responsibilities:
- choose objectives from live world state
- turn objective choice into movement and normal commands
- stay heuristic, bounded, and reconstructible
- provide the real progression brain that hosted play reuses
- provide the grouped `/follow` and regroup pattern that hosted play adapts for
  player parties

### 6. Social and LLM overlays

Primary files:
- `server/ambient_bots/social.ts`
- `server/ambient_bots/llm_coordinator.ts`
- `server/hosted_play/llm.ts`

Responsibilities:
- support party follow, combat assist, and regroup
- support bounded whisper and friend overlays
- reuse the structured LLM plan and reply coordinator with hosted-play-specific
  budgets and cooldowns

## Runtime flow

1. A real player logs into the world normally.
2. The player opens the game menu and enables hosted play.
3. The server validates ownership and online state, then marks the live session
   as hosted in the hosted runtime.
4. On each hosted runtime tick, the runtime builds a live state view from the
   current `ClientSession` and nearby entities.
5. The runtime feeds that view into the shared automation brain.
6. The brain returns movement input and normal commands.
7. The hosted runtime layers party coordination, social shell behavior, action
   logging, and any validated LLM overlays on top of that live state.
8. The hosted runtime applies those actions through named `GameServer` seams.
9. If the runtime hits an internal error, it pauses briefly and clears stale
   movement while surfacing the error to the UI.
10. If the session disconnects or the player disables hosted play, the runtime
   stops and clears control state.

## Party coordination flow

The hosted party layer runs before normal brain movement is applied. It is a
small overlay rather than a second gameplay brain.

- `solo` mode ignores incoming party invites so the player remains in control.
- `follow_leader` mode accepts incoming party invites with `paccept`.
- Once grouped, the layer reads the authoritative `self.party` snapshot.
- A follower uses `/follow <leader>` only when outside the small follow start
  range and inside the maximum follow range.
- A nearby follower keeps brain movement paused even when it does not need to
  resend `/follow`, preserving server-side follow instead of fighting it.
- If a visible hostile mob is attacking another party member, the layer targets
  that mob and lets the normal combat brain continue from that target.
- A leader may hold for distant party members, but a hosted follower does not
  invite more members or override a real player's leadership.

## Diagnostics flow

Hosted play keeps a bounded debug snapshot in memory for the owner status
endpoint. The UI uses it to show:

- current objective, quest, dungeon, movement intent, facing, and travel goal
- recent brain commands and command ages
- party mode, party leader, leader distance, and whether brain movement is
  paused by the party overlay
- pending social replies and LLM request state
- LLM plan and social prompt, raw output, provider, latency, cache status, and
  validation result

The chat action log is separate from the detail view. It emits short, throttled
log lines for major automation intentions such as accepting a quest, working on
a quest, recovering, releasing spirit, traveling to a vendor, or gathering a
party. It is persisted as a per-character preference so players can keep the
chat log quiet while retaining the detail panel for debugging.

## Authority boundary

- `src/sim/` remains deterministic and unaware of hosted play.
- The shared sim still resolves all combat, loot, quest, and economy outcomes.
- Hosted play may automate inputs, not outcomes.
- LLM output may shape social or planning overlays only and
  must never directly mutate authoritative state.

## Design priorities

1. Ship same-session hosted play before persistence and social realism.
2. Reuse ambient automation logic where it fits, especially the progression
   brain.
3. Keep explicit player control simple and trustworthy: start, stop, settings,
   and visible diagnostics.
4. Keep social and LLM layers as overlays on the stable same-session loop.

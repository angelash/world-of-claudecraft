# Architecture: Ambient Player Bots

## Design summary

Ambient player bots are a layered real-server system. The planner decides which
bots should exist around nearby humans. The runtime logs those bots into the
real server. The progression brain decides what they try to do next. Group and
social layers shape the bot's behavior without bypassing server authority.

## Component model

### 1. Persistent registry

Primary files:
- `server/ambient_player_bot_db.ts`
- `server/ambient_bots/types.ts`

Responsibilities:
- bot identity, account, and character linkage
- profile, class, level band, preferred zones
- lifecycle state, assignment, cooldown, reservation, and runner state
- durable social memory and operator-visible diagnostics

### 2. Planner and cluster orchestrator

Primary files:
- `server/ambient_bots/service.ts`
- `server/ambient_bots/config.ts`
- `server/ambient_bots/profiles.ts`

Responsibilities:
- cluster nearby humans
- compute target ambient population
- reuse suitable online bots before provisioning fresh ones
- emit login, logout, release, and provision actions

### 3. Real-server runtime

Primary files:
- `server/ambient_bots/runtime.ts`
- `server/ambient_bots/api_client.ts`
- `server/ambient_bots/ws_client.ts`
- `server/main.ts`

Responsibilities:
- register and log in accounts
- create characters
- connect over the real WebSocket
- merge snapshots and events
- dispatch real commands and movement input
- persist live runner state back into the registry

### 4. Progression brain

Primary files:
- `server/ambient_bots/brain.ts`
- `server/ambient_bots/progression_routes.ts`

Responsibilities:
- choose the current quest, travel, combat, vendor, dungeon, or recovery
  objective from live snapshot state
- translate that objective into movement input and normal player commands
- remain reconstructible from live state only

### 5. Group coordinator

Primary files:
- `server/ambient_bots/group.ts`

Responsibilities:
- use party state to invite, accept, decline, enter dungeons, regroup, follow,
  assist, and hold pulls
- keep grouped bots cohesive without dungeon-only cheat paths
- stay bounded to bots already assigned to the same nearby human cluster
- distinguish bot-led parties from real-player-led parties so assigned bots
  follow and assist a human leader without taking over group assembly

### 6. Social shell and LLM overlays

Primary files:
- `server/ambient_bots/social.ts`
- `server/ambient_bots/llm_types.ts`
- `server/ambient_bots/llm_prompt.ts`
- `server/ambient_bots/llm_validate.ts`
- `server/ambient_bots/llm_provider.ts`
- `server/ambient_bots/llm_coordinator.ts`

Responsibilities:
- handle whispers, friend adds, presence emotes, and lightweight memory
- optionally ask the model for bounded social or planning overlays
- validate, audit, cache, and rate-limit every model-assisted output

### 7. Admin and rollout surface

Primary files:
- `server/admin.ts`
- `scripts/ambient_bot_admin_smoke.mjs`

Responsibilities:
- expose planner, runtime, and LLM diagnostics
- support rollout levers and incident controls
- provide operator smoke paths against persistent Postgres-backed realms

## Runtime flow

1. The planner groups nearby humans into a shared cluster.
2. The planner compares live cluster demand against active and reusable bots.
3. It emits provision or login actions for the best-fitting identities.
4. The runtime fulfills those actions through the real HTTP and WS surfaces.
5. The bot runner receives live snapshots and ticks the progression brain.
6. Group and social layers add party invite handling, follow preservation,
   combat assist, regroup, and chat behavior.
7. The runtime updates registry state, metrics, and optional LLM overlays.
8. If the bot drifts beyond cluster release rules, the planner logs it out and
   later replaces it with a better local fit.

## Group coordination flow

The ambient group coordinator is intentionally narrow and lives outside
`server/game.ts`.

- It reads the bot's current live snapshot, recent personal events, objective
  metadata, and the ambient bot directory.
- It scopes same-bot grouping to the assigned cluster and current objective, so
  bots on different quest steps do not form incoherent parties.
- If a bot is not in a party and receives a trusted invite from a same-cluster
  bot or its assigned player, it sends `paccept`.
- If a bot receives an unrelated invite, it sends `pdecline` so later trusted
  invites are not blocked by the sim's single pending invite slot.
- If the bot is the bot-led group leader, it may invite visible same-objective
  peers and hold while ambient party members lag.
- If a real player is the party leader, the bot treats itself as a follower. It
  follows and assists, but does not wait for more members or invite other bots.
- Followers use the normal `/follow <leader>` chat path when outside the follow
  start range. When already near the leader, they still pause brain movement to
  preserve the server follow state.
- If a visible hostile mob is attacking another party member, the bot targets it
  so the normal progression and combat brain can assist through regular combat
  commands.

## Authority boundary

- `src/sim/` stays deterministic and model-unaware.
- `server/game.ts` and the shared sim remain the only source of gameplay truth.
- Bot brains propose normal player inputs and commands only.
- LLM output may adjust social mode or narrative explanation, but never direct
  authoritative world mutation.

## State sources

Use these state sources, in this order:

- persistent registry fields for identity, assignment, cooldown, and last known
  zone or level
- live snapshot state for current objective reconstruction
- live party, social, and event streams for grouping and chat behavior
- validated LLM overlay state for sparse social or planning hints

Avoid these:

- hidden bot-only sim flags
- production-only movement or combat shortcuts
- large fork-only branches inside `server/game.ts`

## Current design priorities

1. Keep the real-server progression ladder expanding until bots can play much
   deeper into the live quest graph.
2. Harden grouped dungeon behavior so bots stay cohesive and complete bosses
   reliably.
3. Continue social realism through bounded memory and LLM overlays.
4. Preserve operator control and debuggability as the behavior surface grows.

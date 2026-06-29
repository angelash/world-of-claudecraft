# Architecture: Ambient Player Bots

## Design summary

Ambient player bots are a layered real-server system. The planner decides which
bots should exist around nearby humans. The runtime logs those bots into the
real server. The progression brain decides what they try to do next. Group and
social layers shape the bot's behavior without bypassing server authority. A
shared party-role planner keeps grouped tactics and grouped dialogue aligned.

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
- `server/ambient_bots/assignment.ts`

Responsibilities:
- cluster nearby humans
- compute target ambient population
- reuse suitable online bots before provisioning fresh ones
- emit login, logout, release, and provision actions
- persist a stable assigned-player identity bridge, currently the assigned
  player's character name, so later runtime layers can trust the right human
  even if live entity pids change across sessions

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
- carry assignment metadata from planner actions into durable bot state so
  group and social layers read the same assigned-player identity

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
- `server/ambient_bots/group_support.ts`
- `server/ambient_bots/party_roles.ts`

Responsibilities:
- use party state to invite, accept, decline, enter dungeons, regroup, follow,
  assist, and hold pulls
- run party support tactics outside the main progression brain: pre-fight party
  buffs, healer response, tank response, and focus-fire target selection
- derive a deterministic role split from live party composition, such as main
  tank, primary healer, and focus-following damage roles, so the support layer
  and dialogue layer reference the same assignments
- keep grouped bots cohesive without dungeon-only cheat paths
- stay bounded to bots already assigned to the same nearby human cluster
- distinguish bot-led parties from real-player-led parties so assigned bots
  follow and assist a human leader without taking over group assembly
- resolve trusted real-player invites through stable assigned-player metadata
  instead of comparing a transient live entity pid to a stored character id

### 6. Social shell, party chat shell, and LLM overlays

Primary files:
- `server/ambient_bots/social.ts`
- `server/ambient_bots/party_chat.ts`
- `server/ambient_bots/llm_types.ts`
- `server/ambient_bots/llm_prompt.ts`
- `server/ambient_bots/llm_validate.ts`
- `server/ambient_bots/llm_provider.ts`
- `server/ambient_bots/llm_coordinator.ts`

Responsibilities:
- handle whispers, friend adds, presence emotes, and lightweight memory
- handle ambient-bot-led party-chat simulation through the normal `chat`
  command path (`/p ...`), including leader briefings and follower
  acknowledgements
- keep player-led parties quiet by default so bots do not talk over the real
  leader
- optionally ask the model for bounded social or planning overlays
- optionally ask the model for bounded party-chat phrasing, while falling back
  to short deterministic template pools when the model is disabled, denied, or
  rejected
- validate, audit, cache, and rate-limit every model-assisted output
- mirror direct friend adds from real players back through the normal social
  command path so the live UX settles into a mutual friend state instead of a
  fake pending-request state

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
   regroup, combat support, focus-fire nudges, role planning, and chat
   behavior.
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
- Assigned-player trust comes from planner-assigned identity metadata,
  currently the assigned player's character name, because the party invite
  event's live `fromPid` is an entity pid and may not match the persistent
  assigned player character id.
- If a bot receives an unrelated invite, it sends `pdecline` so later trusted
  invites are not blocked by the sim's single pending invite slot.
- If the bot is the bot-led group leader, it may invite visible same-objective
  peers and hold while ambient party members lag.
- If a real player is the party leader, the bot treats itself as a follower. It
  follows and assists, but does not wait for more members or invite other bots.
- When the party is ambient-bot-led, the coordinator also exposes one shared
  role plan, currently leader, tank, healer, and focus-following members, so
  grouped support and grouped dialogue do not drift apart.
- Followers use the normal `/follow <leader>` chat path when outside the follow
  start range. When already near the leader, they still pause brain movement to
  preserve the server follow state.
- If a visible hostile mob is attacking another party member, the bot targets it
  so grouped support can either open on it directly or hand it to the normal
  combat brain through regular combat commands.

## Party role and chat flow

The party role planner and party chat shell are intentionally separate from the
whisper social shell.

- `party_roles.ts` reads live party composition and visible aura state to pick a
  deterministic frontline anchor, a primary healer when available, and the
  remaining focus-following roles.
- `party_chat.ts` consumes that plan and schedules small real party-chat lines
  through normal `/p` commands, never privileged server-side text injection.
- In ambient-bot-led parties, the leader queues one short briefing when the
  composition, objective, or regroup state changes enough to matter.
- Followers listen for the ambient leader's party line, queue one
  acknowledgement, and confirm their own duty.
- The LLM path is advisory and bounded. It may rephrase the line, but it cannot
  change party structure, commands, or tactics. If the LLM is unavailable, the
  shell falls back to short varied templates derived from the same role plan.
- In player-led parties, bots continue to follow and assist, but they do not
  autonomously start this party-roleplay loop.

## Party support flow

The new party support layer lives in `server/ambient_bots/group_support.ts` and
is called from the ambient group coordinator before the normal combat brain is
allowed to drive.

- It first inspects live party state, visible ally auras, hostile aggro targets,
  and the bot's currently known abilities.
- It reads the shared role plan so tank-selection logic stays consistent with
  the role the party dialogue just announced.
- Healing comes first. Healer-capable classes use simple health and threat
  ordering so wounded or threatened allies interrupt DPS behavior.
- Out of combat, support-capable classes apply party-wide preparation through
  normal target-and-cast commands: Priest Fortitude and Shield, Druid Mark and
  Thorns, Paladin Blessing of Might.
- Group preparation is intended to finish before the pull resumes. Leaders may
  hold the party in a safe staging position while buffs, summons, or recovery
  complete, instead of letting members drift into melee range first.
- Tank-role support then runs before generic DPS behavior. The first slice
  covers Warrior tanking directly, plus Bear Druid taunt support when already in
  bear form.
- When no higher-priority support action is needed, grouped bots retarget to a
  shared focus mob so the party collapses damage onto one threat anchor.
- If that focus mob is already inside a usable damage-ability range or
  auto-attack range, the support layer emits the actual offensive command
  itself, such as `target + cast` or `target + attack`, while group
  coordination still owns movement pause. It falls back to travel goals only
  when distance must still be closed.
- This matters because ambient and hosted-play party control both reuse the same
  grouped support layer. A paused brain drive means "do not let the solo brain
  steer this tick", not "stand still and wait to attack".

Current role coverage is intentionally staged rather than pretending every class
has a complete bespoke rotation already:

- Healer support: Priest, Paladin, Shaman, caster-form Druid.
- Tank support: Warrior first-class, Bear Druid taunt support.
- Party buffs: Priest, Druid, Paladin.
- Shared combat coordination: all grouped bots can retarget for focus fire.

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
3. Continue social realism through bounded memory, party chat, and LLM overlays.
4. Preserve operator control and debuggability as the behavior surface grows.

# Brainstorm: Ambient Player Bots

## Product vision

The target is not a one-off scripted showcase. It is a living ambient population
system that runs against the real online server and creates these player-visible
feelings:

- A newly arrived human usually sees about five nearby adventurers doing normal
  MMO things, not just standing in town.
- Those adventurers are not frozen around the human. If the human stops moving
  or stops leveling, the bots continue their own journey and can drift away.
- When a bot population near a human thins out, the world naturally refills with
  logins, fresh characters, or other suitable travelers who fit the current
  zone and level band.
- The system should eventually support social realism: friend add, whisper, chat,
  delayed replies, memory of past interactions, and believable refusal or silence.

## What the repo already gives us

The project already has unusually strong foundations for this feature:

- Real account, login, character creation, and WebSocket session flow already
  exist in `server/main.ts`, `server/account.ts`, `server/auth.ts`, and
  `server/game.ts`.
- There are real-wire multiplayer bot scripts already, especially
  `scripts/mp_integration.mjs` and `scripts/crypt_raid.mjs`.
- The sim already contains offline player-bot precedent in `src/sim/sim.ts`
  through `startFiestaPractice()`, `updateFiestaBots()`, and `driveFiestaBot()`.
- The server already hosts a mature bounded LLM pipeline in `server/ai/`:
  provider abstraction, prompt builder, validators, audit, budget, and runtime
  diagnostics.
- The current anti-bot contract is present but this checkout ships a stub
  detector, so local development is not blocked by a real enforcement layer.

## Locked architecture

### 1. Use the real server protocol, not privileged sim cheats

Ambient bots must ultimately register, create characters, log in, and play by
driving the same HTTP and WebSocket surfaces normal players use. The sim and
server remain authoritative. We can still build control and orchestration on the
server, but bot actions should resolve through the real wire path.

### 2. Split orchestration from execution

We should not bury all bot logic inside `server/game.ts`.

The system should separate into:

- A server-side ambient coordinator: observes real players, groups them into
  clusters, decides how many bots should exist nearby, assigns bot identities,
  and decides when bots should log in, continue, hand off, or log out.
- A bot identity registry: persistent records for account, character, profile,
  progression band, lifecycle state, and social persona.
- One or more real-server runners: actual bot clients that perform HTTP register,
  character creation, login, and the low-level command and movement loop.
- A progression brain: questing, combat, travel, vendor, recovery, and routing.
- An optional LLM social and planning layer: sparse, bounded, audited, and never
  directly authoritative.

### 3. Manage around human clusters, not literally five bots per human

If two or three humans stand near one another, they should share an ambient bot
population instead of multiplying linearly. The coordinator should cluster nearby
 humans and assign one shared ambient pod, for example:

- solo human: target about 5 bots
- 2 nearby humans: target about 6 bots
- 3 or more nearby humans: target about 7 to 8 bots

This preserves the intended feeling without exploding server load.

### 4. Preserve the illusion with hysteresis, not teleport tricks

Bots should not blink in and out whenever the nearest player moves by a few
yards. The lifecycle manager needs login and logout hysteresis:

- shared cluster radius
- release distance larger than assignment distance
- cooldowns before reuse
- delayed replacement requests
- arrival and departure mixes, not all fresh characters, not all veterans

### 5. LLMs are for sparse reasoning and social texture

LLMs should not drive every movement tick or combat decision. They are best used
for low-frequency planning and social expression:

- choose next questing objective or travel intent
- explain why a bot pauses, detours, or joins a road
- generate bounded chat, whisper, and friend responses
- compress memory and relationship summaries
- adapt persona tone per zone, class, and player history

Low-level play should remain heuristic, deterministic where possible, cheap, and
safe to run at scale.

## Recommended LLM shape

Use the existing provider pattern in `server/ai/` and keep the same safety model:

- provider returns structured JSON only
- output is validated before use
- output names bounded intents, not direct state mutation
- runtime budget, caching, cooldowns, and audit stay visible to operators

Recommended layers:

- `BotPlanDecisionV1`: low-frequency plan, 10 to 60 second horizon, such as
  "finish wolves quest, vendor, then walk toward Fenbridge road"
- `BotSocialDecisionV1`: friend, whisper, party reply, apology, greeting, or
  refusal, with moderation and locale rules
- `BotMemorySummaryV1`: relationship state, recent shared events, tone,
  suspicion, and recurring topics

The executor still translates those bounded decisions into real `cmd` and `input`
 traffic.

## New work by surface

### Server

- bot registry tables and repository
- ambient cluster planner and lifecycle scheduler
- diagnostics and operator controls
- bot-aware session metadata, later used to exclude bots from human population
  calculations and certain moderation counters

### Headless / runner

- real-server bot client runtime
- account register and character create pipeline
- login, reconnect, heartbeat, snapshot merge, and command loop
- progression behavior tree / planner

### Sim and net

- mostly unchanged for Phase 1
- later phases may need tiny named seams for extra bot telemetry or safe
  command coverage, but the core principle is to reuse existing protocol

### Social and AI

- bounded bot social schemas
- memory and per-player relationship state
- moderation, rate limit, and block-list compliance

### Admin / ops

- diagnostics endpoint and later dashboard surface
- per-realm experiment switch
- budget, population, and failure metrics
- emergency stop, no-new-logins mode, and queue draining

## Risks and open questions

### Trust and policy risk

This system intentionally creates ambient player presence. Before public release,
the product side should decide what disclosure is required in the game, launcher,
site, or terms. The code should support an experiment realm or rollout flag from
day one.

### Load and scaling

The expensive parts are not only LLM calls. Real server bots also multiply:

- active sessions
- snapshots and bandwidth
- pathfinding and combat loops
- persistence churn
- social logging and moderation surfaces

This is why cluster sharing, hysteresis, and sparse LLM use are locked design
choices.

### Progression realism

True "play from level 1 to done" is much harder than combat AI. The system needs:

- quest route knowledge
- recoverable failure handling
- inventory and vendor decisions
- party and dungeon gating
- stuck detection and path repair

This is a phased build, not a single sprint.

### Future bot detection

The open-source checkout currently uses a stub detector. If a real detector lands
later, ambient bots must either use an allowlist path or present approved bot
markers to the detector. That should be planned before production rollout.

# Continuation 09: Bastion Party And Dungeon Bridge

Goal: close the first Bastion group-content gap by letting real ambient bots
pick up `q_olen` and `q_mistcaller`, form a nearby ambient party on the live
server, enter the Sunken Bastion together, and route toward the Olen and Vael
boss objectives through the normal dungeon path.

## Scope

Build:
- route coverage for `q_olen` and `q_mistcaller`
- data-driven dungeon-route support in the progression brain, including Bastion
  entry, in-instance boss pathing, and dungeon exit for turn-ins
- a focused runtime group layer that uses real `pinvite`, `paccept`, and
  `enter_dungeon` commands for nearby ambient bots in the same human cluster
- focused brain and runtime regressions for Bastion accept order, party
  formation, dungeon entry, Olen-first routing, and dungeon exit after both
  boss quests are ready
- packet updates that hand off the remaining Bastion QA sweep

Do not build:
- deeper in-dungeon social choreography, raid conversion, or `/follow`
- special-cased combat cheats or instance-only bot mutation paths
- new LLM behavior
- post-Bastion Zone 3 progression

## Required constraints

- keep Bastion quest routing data-driven in
  `server/ambient_bots/progression_routes.ts`
- keep all authority on the real server and sim path, including invites,
  accepts, and dungeon entry
- keep the runtime group bridge bounded to nearby ambient bots already assigned
  to the same human cluster
- keep Bastion route state reconstructible from live quest state, live party
  state, and live snapshot position only

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot can progress from `q_bastion_door` into `q_olen` and
  `q_mistcaller`.
- Bots with the Bastion objective in the same nearby human cluster can invite
  each other, accept those invites, and enter the Sunken Bastion through the
  real server command path.
- Once inside, the progression brain routes Olen before Vael, then exits the
  dungeon to hand the quests back in without hidden dungeon-progress memory.

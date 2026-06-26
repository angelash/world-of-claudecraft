# Continuation 10: Bastion In-Dungeon Cohesion

Goal: harden the first Sunken Bastion group slice so ambient bots stay together
inside the dungeon, avoid leader over-pulling, and keep follower bots attached
to the party while routing Olen and Vael through the live server path.

## Scope

Build:
- a bounded in-dungeon regroup layer in `server/ambient_bots/group.ts`
- follower-side real `/follow` usage through the normal chat command path
- leader-side movement and pull suppression when party members lag too far
  behind inside Sunken Bastion
- focused tests that prove followers reattach and leaders wait before advancing
  deeper into Bastion
- packet updates that document the new cohesion slice and hand off its QA pass

Do not build:
- raid conversion or multi-dungeon generalized party AI
- special combat cheats, teleport repair, or direct instance-state mutation
- new LLM behavior
- Zone 3 progression

## Required constraints

- keep all party, follow, and regroup behavior on the real command path
- keep the group layer bounded to same-cluster ambient bots already in the same
  Bastion objective flow
- keep the brain route data-driven and reconstructible from live snapshot plus
  party state only
- do not add deep fork-only branches to `server/game.ts`

## Suggested validation

- `npx vitest run tests/ambient_player_bot_group.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A follower bot inside Sunken Bastion can use the normal `/follow <leader>`
  chat path to reattach to the party leader.
- A Bastion party leader does not keep running deeper or start a clean pull
  while the group is visibly split inside the dungeon.
- The Bastion route still reaches Olen first, then Vael, then the dungeon exit,
  with no special-case authority bypass.

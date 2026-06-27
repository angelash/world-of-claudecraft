# Continuation 04: Town Resupply And Consumables

Goal: let real ambient bots restock food and drink through the live vendor path
so they can sustain longer quest routes without stalling once their bags run
dry.

## Scope

Build:
- a snapshot-driven resupply objective that can override active out-of-town
  quest routes when consumables run low
- real vendor buy command usage through Trader Wilkes
- combined vendor behavior that sells junk first, then buys food or drink
- focused brain and runtime regressions for town restocking

Do not build:
- potion usage, repair loops, or equipment shopping
- mage conjure optimization
- higher-zone route ladders or multi-town supply graphs
- party, dungeon, or escort quest support

## Required constraints

- keep all restock decisions reconstructible from live snapshot inventory,
  copper, quest state, and nearby entities
- reuse the real `buy` and `sell_all_junk` command path, with no privileged
  economy shortcuts
- keep vendor logic inside the ambient bot brain and runtime, not deep special
  cases in `server/game.ts`

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot with an active field quest and low food can travel to Trader
  Wilkes and issue a real vendor `buy` command.
- Mana classes can restock drink through the same real vendor path.
- When junk and low consumables coincide, the vendor stop sells junk first and
  then continues the resupply ladder on later ticks.

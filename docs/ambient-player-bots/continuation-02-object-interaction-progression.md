# Continuation 02: Object Interaction Progression

Goal: extend the real ambient-bot progression loop beyond pure kill quests by
adding object, ground-item, and other non-kill interaction support needed for
Eastbrook collection and story chains.

## Scope

Build:
- focused progression support for interactable objects and ground pickups
- route coverage for `q_supplies`
- the first Brother Aldric chain support where object or item interaction is
  required
- inventory and objective checks that distinguish object collection from mob
  kills
- focused brain and runtime regressions for object-route behavior

Do not build:
- multi-zone progression or higher-level travel graphs
- economy depth such as buying consumables or repairing gear
- party, dungeon, or escort quest behavior
- free-form LLM planning changes

## Required constraints

- keep authoritative outcomes in the real server and sim
- keep new progression logic in focused modules and registries, not deep
  special cases in `server/game.ts`
- use existing live snapshot and sim content data, not handwritten duplicate
  quest tables

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected bot can complete `q_supplies` through object or pickup
  interaction instead of idling or grinding forever.
- The progression brain can express object-route travel, interact, and
  collection steps without breaking existing kill-quest routes.
- The new route support remains reconstructible from live snapshot state.

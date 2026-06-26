# Continuation 01: Expanded Solo Progression

Goal: reopen progression work after the original Phase 16 checkpoint and extend
the live ambient-bot brain from the first wolf quest into a believable Eastbrook
solo kill-quest chain.

## Scope

Build:
- a focused quest-route registry for early solo progression
- route-driven objective selection beyond `q_wolves`
- Eastbrook kill-route coverage for `q_boars`, `q_spiders`, `q_murlocs`,
  `q_mine`, `q_greyjaw`, `q_bandits`, and `q_ringleader`
- quest-specific hunt behavior that stays on the required mob instead of
  chasing unrelated nearby hostiles
- focused brain regressions for accept, turn-in, and route-discipline cases

Do not build:
- object or ground-item interaction quests such as `q_supplies`
- Brother Aldric's chapel and graveyard chain
- higher-zone progression, supply buying, or repair loops
- party, dungeon, or free-form social behavior

## Required constraints

- progression still runs only through real WebSocket commands and movement
  frames
- `src/sim/` remains unchanged and deterministic
- route selection stays data-driven and fork-merge-friendly
- quest-specific hunting may only fall back to any-hostile search when the
  current objective explicitly allows it

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected bot can keep picking up Eastbrook solo kill quests after
  `q_wolves` instead of dropping straight to grind.
- A connected bot can turn in those quests when ready and move to the next
  eligible NPC in quest-order-safe fashion.
- A quest-specific hunt route does not peel off to unrelated nearby mobs unless
  the route explicitly allows fallback.
- The progression brain keeps its state reconstructible from live snapshot data.

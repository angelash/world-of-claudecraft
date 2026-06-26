# Continuation 03: Mixed-Source Collection Progression

Goal: keep the real ambient-bot progression loop moving through quests that
need multiple collection sub-objectives from different mob camps, starting with
`q_rite`.

## Scope

Build:
- route-level sub-objective gating for progression routes that share one quest
- mixed-source collection support for `q_rite`
- objective ids that stay distinct when one quest switches between multiple live
  sub-routes
- focused brain regressions for accept flow, first-source routing, and
  second-source handoff

Do not build:
- town supply buying, repairs, or deeper economy loops
- group, dungeon, or escort quest support
- higher-zone travel graphs
- free-form LLM planning changes

## Required constraints

- keep all progression decisions reconstructible from live snapshot quest and
  inventory state
- keep quest routing data-driven in `progression_routes.ts`
- preserve real server and sim authority, with no special pickup or drop-credit
  shortcuts

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected bot can accept `q_rite` in quest-order-safe fashion through the
  real Aldric interaction path.
- While `q_rite` is active, the brain hunts tunnel rats until Blessed Tallow is
  complete, then switches to restless bones for Ghostly Essence.
- Route switching between `q_rite` sub-objectives resets cleanly because the
  active objective ids are distinct.

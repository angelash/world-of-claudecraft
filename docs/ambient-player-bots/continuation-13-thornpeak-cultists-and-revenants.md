# Continuation 13: Thornpeak Cultists And Revenants

Goal: extend the real progression ladder past the mid-Thornpeak warfront and
into the late outdoor solo chains so ambient bots can work through the Wyrmcult
camps and revenant fields while staying on the same live server path.

## Scope

Build:
- route coverage for `q_zealots`, `q_cult_orders`, `q_necromancers`,
  `q_revenants`, and `q_revenant_vanguard`
- route handling for mixed kill or collect objectives that stay on the same mob
  family, such as zealot orders and necromancer phylacteries
- focused brain and runtime regressions for cult-route order, mixed-objective
  cult hunts, revenant handoff, and the late-zone outdoor flow
- packet updates that hand off the remaining Thornpeak solo QA sweep

Do not build:
- `q_wyrm_sigils`, `q_breaking_the_seal`, `q_voice_below`, or `q_sanctum_gate`
- `q_crushers`, `q_drogmar`, or any new outdoor party logic
- Sanctum bosses or grouped instance flow
- new LLM behavior

## Required constraints

- keep the progression ladder data-driven in
  `server/ambient_bots/progression_routes.ts`
- keep all travel, quest pickup, turn-in, combat, looting, and vending on the
  normal live server command path
- keep route progression reconstructible from live quest state, nearby entities,
  inventory, and current position only
- keep the Wyrmcult and revenant ladders bounded to the mobs and quest sources
  defined by the live Zone 3 quest data

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes the mid-Thornpeak ogre and Stormcrag outdoor
  ladders can pick up the Wyrmcult chain and progress through `q_zealots`,
  `q_cult_orders`, and `q_necromancers` through the normal live quest, combat,
  and mixed kill or collect flow.
- A connected bot can pick up the revenant fields chain and progress through
  `q_revenants` and `q_revenant_vanguard` through the normal live kill and
  turn-in path.
- The late outdoor solo ladders remain data-driven and bounded, without
  introducing hidden progression memory or party-only shortcuts.

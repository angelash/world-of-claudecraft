# Continuation 14: Thornpeak Sanctum Approach

Goal: extend the real progression ladder past the late-Thornpeak solo outdoor
chains and into the Sanctum-approach prep ladder so ambient bots can work
through the final outdoor sigil, ember, congregation, and gate-key quests
before the later grouped or boss content.

## Scope

Build:
- route coverage for `q_wyrm_sigils`, `q_breaking_the_seal`, `q_voice_below`,
  and `q_sanctum_gate`
- route handling for mixed kill objectives across zealots and necromancers
  inside `q_voice_below`
- focused brain and runtime regressions for sigil collection, ember collection,
  congregation cleanup, and gate-key shard recovery
- packet updates that hand off the remaining Thornpeak outdoor QA sweep

Do not build:
- `q_korgath`, `q_velkhar`, `q_gravewyrm`, or dungeon or boss content
- new party or dungeon logic
- new LLM behavior
- broader grouped Thornpeak orchestration

## Required constraints

- keep the progression ladder data-driven in
  `server/ambient_bots/progression_routes.ts`
- keep all travel, quest pickup, turn-in, combat, looting, and vending on the
  normal live server command path
- keep route progression reconstructible from live quest state, nearby entities,
  inventory, and current position only
- keep Sanctum-approach routes bounded to the live Zone 3 quest data and valid
  zealot, necromancer, elemental, or object sources

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot that finishes the late-Thornpeak cult and revenant ladders
  can pick up and complete `q_wyrm_sigils`, `q_breaking_the_seal`,
  `q_voice_below`, and `q_sanctum_gate` through the normal live quest, combat,
  loot, and object-interaction path.
- The mixed `q_voice_below` kill objectives stay bounded to the intended zealot
  and necromancer sources.
- The Sanctum-approach outdoor prep ladder remains data-driven and bounded,
  without introducing hidden progression memory or party-only shortcuts.

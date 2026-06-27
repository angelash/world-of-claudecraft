# Continuation 05: Cross-Zone Fenbridge Progression

Goal: extend the real ambient-bot progression loop beyond Eastbrook so bots can
cross the causeway, complete the Fenbridge handoff, and keep playing through
the first Zone 2 starter quests.

## Scope

Build:
- distinct turn-in NPC support for progression routes that hand one quest from
  one settlement NPC to another
- route coverage for `q_fenbridge_muster`, `q_prowlers`,
  `q_prowler_pelts`, `q_fen_supplies`, `q_deepfen`, `q_idols`, and
  `q_deepfen_purge`
- focused brain regressions for the Aldric to Fenwick handoff, long-travel
  object pickup, and the first Fenbridge hunt and collect routes
- a focused runtime regression that proves the cross-zone handoff still emits
  real movement input over `/ws`

Do not build:
- deeper Mirefen ladders such as widows, drowned, trolls, cultists, or
  bastion content
- zone-aware vendor upgrades, repair loops, or gear shopping
- multi-quest hub bundling, escort quests, or group content
- new LLM planning behavior

## Required constraints

- keep all progression logic reconstructible from live snapshot quest state,
  counts, nearby entities, and the existing bot record
- keep route definitions data-driven in `server/ambient_bots/progression_routes.ts`
- reuse the live `/ws` seed plus shared player pathfinding for the long northbound
  walk, with no teleport or bot-only movement shortcut
- preserve real server and sim authority, with no quest-credit shortcuts

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot can accept `q_fenbridge_muster` from Brother Aldric, walk
  north under real movement input, collect the muster order, and turn it in to
  Warden Fenwick.
- After the handoff, the brain can continue into the first Fenbridge starter
  ladder: prowlers, pelts, caravan supplies, Deepfen snappers, idols, and the
  follow-up purge.
- The new cross-NPC turn-in support does not break earlier same-NPC quest
  accept and turn-in flow.

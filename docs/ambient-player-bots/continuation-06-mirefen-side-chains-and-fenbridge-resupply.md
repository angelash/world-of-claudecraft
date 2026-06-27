# Continuation 06: Mirefen Side Chains And Fenbridge Resupply

Goal: keep the real ambient-bot progression loop moving deeper into Mirefen by
covering the widow and drowned solo side chains, while shifting north-zone
vendor stops to Fenbridge so higher-level bots do not keep running back to
Eastbrook for bread and water.

## Scope

Build:
- route coverage for `q_widows`, `q_drowned`, `q_drowned_censers`, and
  `q_no_rest`
- Fenbridge-local vendor selection for junk vending and food or drink resupply
  when the bot is operating in Mirefen Marsh
- focused brain regressions for the widow and drowned route ladder plus north
  vendor restocking
- a focused runtime regression that proves Fenbridge resupply still uses a real
  vendor `buy` command over `/ws`

Do not build:
- boss or special-case content such as `q_broodmother`, `q_the_codfather`,
  troll barrows, cult camps, or Bastion content
- escort, party, or dungeon progression
- new LLM planning behavior or social changes
- economy shortcuts outside the normal vendor path

## Required constraints

- keep quest routing data-driven in `server/ambient_bots/progression_routes.ts`
- keep mixed kill and drop behavior reconstructible from live quest counts,
  inventory, and nearby entities, with no hidden progression memory
- keep north-zone sustain inside the existing brain and runtime path, not in
  `server/game.ts`
- reuse real vendor commands, real movement input, and real interact flow only

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot can progress from the Fenbridge starter ladder into
  `q_widows`, `q_drowned`, `q_drowned_censers`, and `q_no_rest`.
- Bots operating in Mirefen Marsh use `Provisioner Hale` for junk sales and
  food or drink restock instead of walking back to Trader Wilkes.
- The Fenbridge vendor change does not break the earlier Eastbrook vendor path.

# Continuation 07: Mirefen Troll And Cultist Outdoors

Goal: keep the real ambient-bot progression loop moving through the next Mirefen
outdoor quest band by covering the Broodmother follow-up, troll barrows,
Grubjaw, and the first Gravecaller camp assault.

## Scope

Build:
- route coverage for `q_broodmother`, `q_trolls`, `q_troll_fetishes`,
  `q_grubjaw`, and `q_cult_camp`
- multi-objective route handoff for `q_broodmother`, where the same quest
  advances from Mirefen widows to the Broodmother herself
- focused brain regressions for the Broodmother handoff, troll barrow chain,
  Grubjaw pickup, and cult-camp assault
- packet updates that close Continuation 06 QA and hand off the next cultist
  and Bastion approach gap

Do not build:
- `q_summoners`, `q_deacon`, or `q_bastion_door`
- dungeon or group-gated content such as `q_olen` or `q_mistcaller`
- new runtime control, social, or LLM behavior
- new authority shortcuts or bot-only quest completion paths

## Required constraints

- keep quest routing data-driven in `server/ambient_bots/progression_routes.ts`
- keep the Broodmother handoff reconstructible from live quest counts only,
  with no hidden progression memory
- preserve the natural Zone 2 quest order so bots do not skip ahead to later
  Aldric or Fenwick chains before earlier outdoor follow-ups
- reuse the normal movement, targeting, combat, loot, and interact flow only

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Acceptance criteria

- A connected bot can progress from the drowned chain into `q_broodmother`,
  then continue through `q_trolls`, `q_troll_fetishes`, `q_grubjaw`, and
  `q_cult_camp`.
- `q_broodmother` switches cleanly from widow kills to the Broodmother kill
  once the first objective is complete.
- The new outdoor routes do not disturb earlier Mirefen handoff or resupply
  behavior.

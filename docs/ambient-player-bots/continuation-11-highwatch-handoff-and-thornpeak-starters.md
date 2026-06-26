# Continuation 11: Highwatch Handoff And Thornpeak Starters

Goal: extend the real progression ladder out of Mirefen and into the first
Thornpeak Heights quest loop so ambient bots can hand off from Brother Aldric
to Highwatch, take the first ridge and kobold starter quests, and stay locally
supplied instead of drifting back to low-level fallback behavior.

## Scope

Build:
- route coverage for `q_highwatch_summons`, `q_stalkers`,
  `q_stalker_pelts`, `q_kobold_tunnels`, and `q_glowing_wax`
- route-level overlap gating so the kill and collect starter pairs are picked up
  and completed in a natural order
- Highwatch-local vendor resupply for food and drink
- Thornpeak-local fallback grinding so bots that outpace the current quest
  ladder stay in the mountain zone instead of walking back south
- focused brain and runtime regressions for the Highwatch handoff, the ridge
  pair, the kobold pair, and the local vendor buy path
- packet updates that hand off the remaining Thornpeak QA sweep

Do not build:
- the ogre, elemental, Wyrmcult, or Sanctum chains
- new party or dungeon logic
- new LLM behavior
- generalized cross-zone grind heuristics for every future zone

## Required constraints

- keep the progression ladder data-driven in
  `server/ambient_bots/progression_routes.ts`
- keep all travel, quest pickup, turn-in, combat, looting, and vending on the
  normal live server command path
- keep route progression reconstructible from live quest state, nearby entities,
  inventory, and current position only
- keep fork-local behavior out of large mixed-concern branches in
  `server/game.ts`

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot that finishes the Mirefen Bastion chain can pick up
  `q_highwatch_summons`, travel into Thornpeak, and hand the quest off at
  Highwatch through the normal quest and movement path.
- Highwatch starter bots can complete the ridge stalker pair and the kobold
  pair in a natural overlap order, with the earlier ready quest held while the
  parallel active quest is still unfinished.
- A bot operating in Thornpeak can restock through Quartermaster Bree and use a
  local fallback grind route instead of walking back to Eastbrook when the
  current starter ladder pauses on level gating.

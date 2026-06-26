# Continuation 08: Cult Summoners, Deacon, And Bastion Approach

Goal: keep the real ambient-bot progression loop moving through the last
outdoor Mirefen solo chain by covering the summoner cleanup, Deacon Voss, and
the Bastion ward-stone approach.

## Scope

Build:
- route coverage for `q_summoners`, `q_deacon`, and `q_bastion_door`
- multi-source kill routing for the cipher stage of `q_summoners`, with
  Gravecaller summoners preferred and Gravecaller menders as a bounded fallback
- focused brain regressions for summoner pickup, stage handoff, Deacon Voss,
  and Bastion ward-stone collection
- packet updates that close Continuation 07 QA and hand off the remaining
  group-gated Bastion quest gap

Do not build:
- `q_olen` or `q_mistcaller`
- party or dungeon orchestration
- new runtime, social, or LLM behavior
- new authority shortcuts or bot-only quest completion paths

## Required constraints

- keep quest routing data-driven in `server/ambient_bots/progression_routes.ts`
- keep the `q_summoners` stage handoff reconstructible from live quest counts
  only, with no hidden progression memory
- keep the cipher stage bounded to mobs that can actually drop `cult_cipher`
- reuse the normal movement, targeting, combat, loot, and interact flow only

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Acceptance criteria

- A connected bot can progress from `q_cult_camp` into `q_summoners`,
  `q_deacon`, and `q_bastion_door`.
- The cipher stage of `q_summoners` prefers nearby summoners but can continue
  on menders without hidden progression state if summoner drops run short.
- The new outdoor routes do not disturb earlier Mirefen ordering or Fenbridge
  resupply behavior.

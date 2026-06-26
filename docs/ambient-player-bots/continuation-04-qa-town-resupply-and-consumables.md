# Continuation 04 QA: Town Resupply And Consumables

Goal: audit town restocking before moving on to longer autonomous travel and
higher-zone route ladders.

## Audit checklist

- verify low-consumable detection uses live snapshot inventory and copper only
- verify active NPC accept or turn-in objectives still take precedence over
  resupply when the bot is already at a quest giver
- verify the vendor stop sells junk before issuing buy commands
- verify real vendor buy commands include the correct npc id and item id
- verify focused ambient-bot suites, `build:server`, and the local pg-mem smoke
  stay green

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Stop conditions

- stop and fix before continuation close if restocking needs hidden runtime-only
  economy state
- stop and fix before continuation close if the new vendor path breaks existing
  quest accept, turn-in, or object-route behavior

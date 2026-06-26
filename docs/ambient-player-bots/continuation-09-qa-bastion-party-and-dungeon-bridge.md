# Continuation 09 QA: Bastion Party And Dungeon Bridge

Goal: audit the first Bastion group-content bridge before extending autonomous
progression past Zone 2.

## Audit checklist

- verify `q_olen` is accepted before Bastion entry, but `q_mistcaller` is still
  picked up before the bots head underground
- verify nearby ambient bots in the same cluster use real `pinvite`,
  `paccept`, and `enter_dungeon` commands only
- verify Olen remains the first in-instance target, while `q_olen` turn-in is
  deferred until `q_mistcaller` is no longer active
- verify the dungeon-exit handoff works once the Bastion boss quests are ready
- verify focused ambient-bot suites, `build:server`, and the local pg-mem smoke
  stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke_pgmem.mjs`

## Stop conditions

- stop and fix before continuation close if Bastion party formation requires a
  bot-only shortcut or loses cluster affinity from the planner action path
- stop and fix before continuation close if the dungeon handoff leaves bots
  stuck underground, bypasses Olen, or turns `q_olen` in before Vael is done

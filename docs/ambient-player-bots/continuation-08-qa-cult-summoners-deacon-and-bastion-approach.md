# Continuation 08 QA: Cult Summoners, Deacon, And Bastion Approach

Goal: audit the last outdoor Mirefen solo chain before moving on to the
group-gated Bastion quests.

## Audit checklist

- verify `q_summoners` changes cleanly from the summoner kill objective to the
  cipher stage based on live quest counts only
- verify the cipher stage stays bounded to valid drop sources, with summoners
  preferred and menders only used as the fallback source
- verify the route order stays natural, especially that `q_summoners` resolves
  before `q_deacon`, and `q_deacon` resolves before `q_bastion_door`
- verify focused ambient-bot suites, `build:server`, and the persistent Postgres smoke
  stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_naming.test.ts tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`
- `node scripts/ambient_bot_admin_smoke.mjs`

## Stop conditions

- stop and fix before continuation close if the cipher-stage fallback needs
  hidden progression memory or drifts onto non-dropping cultists
- stop and fix before continuation close if the new route order causes bots to
  skip earlier Mirefen handoffs or bypass `q_deacon`

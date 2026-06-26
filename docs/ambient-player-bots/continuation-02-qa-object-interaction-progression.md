# Continuation 02 QA: Object Interaction Progression

Goal: audit object and collection quest support before moving on to broader
multi-zone progression.

## Audit checklist

- verify object-route objectives only trigger when the underlying quest state
  requires them
- verify bots can reach, face, and interact with required objects or pickups
- verify kill-quest routes still behave correctly after object-route support
- verify focused ambient-bot suites and `build:server` stay green
- confirm `npx tsc --noEmit` adds no new errors outside the unrelated repo
  baseline

## Suggested validation

- `npx vitest run tests/ambient_player_bot_brain.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts tests/admin.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Stop conditions

- stop and fix before continuation close if object interactions require a
  privileged server path instead of the real runtime commands
- stop and fix before continuation close if the new interaction support breaks
  existing kill-route progression or quest turn-in flow

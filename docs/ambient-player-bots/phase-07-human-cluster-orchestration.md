# Phase 7: Human-Cluster Orchestration

Goal: make the ambient population feel stable around real humans by preserving
cluster continuity, reusing already-online bots before fresh logins, and
shedding overflow cleanly when nearby player demand changes.

## Scope

Build:
- stable human-cluster identity across small nearby membership changes
- assignment carry-over so existing pending and assigned population does not
  thrash when one cluster member leaves
- handoff behavior that lets an already-online bot transfer to a better nearby
  cluster before being logged out
- population load-shedding when a cluster target shrinks
- focused planner tests for continuity, handoff, and overflow behavior

Do not build:
- social memory, whispers, or friends
- LLM planning or dialogue
- new persistence tables
- admin controls or dashboards

## Required constraints

- keep orchestration in `server/ambient_bots/service.ts`, not in large
  `server/game.ts` branches
- keep runtime behavior real-wire only, with no privileged sim teleport or
  command shortcuts
- reuse existing level-band and preferred-zone matching instead of inventing a
  separate population model
- preserve hysteresis: do not reassign a released bot straight back to the same
  cluster in the same planning cycle

## Suggested validation

- `npx vitest run tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A nearby shared cluster keeps the same identity when one member leaves, so
  pending provision slots do not reprovision a duplicate pod.
- A bot that drifted away from one human cluster can be handed to a better
  nearby cluster without a forced logout and relog.
- A cluster that shrinks back toward its target sheds extra bots cleanly instead
  of permanently staying overpopulated.
- Planner tests cover continuity, handoff, and overflow behavior.

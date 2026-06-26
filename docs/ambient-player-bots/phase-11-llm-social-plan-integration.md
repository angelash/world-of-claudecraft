# Phase 11: LLM Social and Plan Integration

Goal: add a bounded, low-frequency LLM overlay that can steer ambient bot
social posture and whisper replies without ever becoming an authoritative
gameplay path.

## Scope

Build:
- a typed bounded plan schema for ambient bot social stance
- a typed bounded whisper-reply schema for ambient bot social responses
- prompt builders, validators, audit snapshots, and semantic cache plumbing
- a local provider bridge that can call the Codex CLI with structured JSON
  output
- runtime queueing for plan refresh and whisper reply generation
- budget, cooldown, disable, and fallback behavior that safely downgrades back
  to the heuristic shell
- focused coordinator and runtime tests

Do not build:
- direct model control over movement, combat, quests, or economy
- free-form world simulation memory
- always-on high-frequency model calls
- admin surfaces or rollout tooling beyond env flags and runner-state audit

## Required constraints

- the real HTTP and WebSocket server path remains the only action surface
- model output must be JSON-only and must validate before use
- rejected, disabled, budget-denied, and error cases must fall back to the
  existing heuristic social shell
- cache keys must be semantic, not tied to per-call timestamps or job ids
- prompts and raw outputs must be truncated in audit state to keep persistence
  bounded

## Suggested validation

- `npx vitest run tests/ambient_player_bot_llm.test.ts tests/ambient_player_bot_social.test.ts tests/ambient_player_bot_runtime.test.ts tests/ambient_player_bot_ws_client.test.ts tests/ambient_player_bot_service.test.ts tests/ambient_player_bot_db.test.ts tests/ambient_player_bot_game_server.test.ts tests/ambient_player_bot_connection_gate.test.ts tests/game_sessions.test.ts`
- `npm run build:server`
- `npx tsc --noEmit`

## Acceptance criteria

- A connected ambient bot can request a bounded plan decision for its current
  local objective without mutating authoritative state directly.
- A whispered ambient bot can request a bounded reply decision and still answer
  through the existing real chat command path.
- Invalid or unsafe model output is rejected before it reaches the social shell.
- Disabled or budget-denied model calls do not break the heuristic fallback
  path.
- Audit state records enough reason, prompt, provider, and latency context to
  debug behavior later.

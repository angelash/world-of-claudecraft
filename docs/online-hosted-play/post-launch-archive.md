# Post-launch Archive: Online Hosted Play

This addendum archives the hosted-play refinements that landed after the
original packet was reduced to `README.md`, `requirements.md`, and
`architecture.md`.

## Scope

- 2026-06-28: move hosted-play controls into a persistent right-side HUD panel
  with a compact launcher button
- 2026-06-28: remove the hidden manual-input pause so hosted play now keeps
  running until the owner explicitly stops it or a runtime safety pause occurs
- 2026-06-28: expose a detailed owner-visible diagnostics view for objectives,
  movement, party state, social replies, and LLM audit context
- 2026-06-29: persist the chat action-log preference per character and surface
  richer party coordination diagnostics
- 2026-06-29: preserve hosted automation movement authority while the observing
  online client continues to send idle input frames for telemetry

## Requirement addendum

- The owner control surface now lives in a persistent right-side HUD panel
  rather than inside the Options subview.
- Manual player input is no longer treated as an implicit hosted-play stop or
  pause. Hosted play keeps running until the owner disables it or a runtime
  safety pause triggers.
- The diagnostics surface must expose current objective, movement intent,
  travel goal, party coordination, social shell state, LLM audit context, and
  recent action-log context from the live session.
- The owner can persist the chat action-log preference per character and keep
  the detail panel available even when chat logging stays off.
- When the observing client continues to emit idle input frames, hosted
  automation movement remains authoritative until the hosted runtime yields
  control.

## Design notes

- `src/ui/hosted_play_panel.ts` is the dedicated HUD module for the hosted-play
  launcher button, right-side panel, and detail rendering. `src/ui/hud.ts`
  composes it instead of carrying a one-off hosted-play subview.
- `server/hosted_play/runtime.ts` owns the bounded debug snapshot, action-log
  state, and party overlay details. The UI reads owner-visible status through
  `src/net/online.ts` and does not inspect sim state directly.
- Movement-control arbitration now acknowledges online input sequence numbers
  for client telemetry while preserving hosted automation authority when the
  player's own client is only sending idle frames.
- Party coordination remains an overlay on top of the hosted brain. Follow,
  regroup, assist, and party diagnostics are surfaced from the hosted runtime,
  not reimplemented in the UI.

## Current open design questions

- Whether the right-side panel should stay always visible on very small mobile
  layouts or collapse more aggressively is still a UI follow-up, not a runtime
  blocker.
- Hosted-play diagnostics remain owner-only. Broader admin mirroring is still
  outside this packet's current scope.

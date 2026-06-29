# Post-packet Archive: Ambient Player Bots

This addendum archives the late packet refinements that landed after
Continuation 18 QA and after the live verification policy moved to persistent
Postgres only.

## Scope

- 2026-06-28: add bounded pre-combat preparation before safe quest pulls
- 2026-06-28 to 2026-06-29: stabilize hosted and ambient quest automation with
  path-goal travel, tighter arrival thresholds, safer early-route gating,
  recovery and restock hooks, richer self snapshots, and loot-right filtering
- 2026-06-29: prioritize currently actionable quest work over deferred
  higher-risk routes so mixed quest logs do not stall on outdated grind loops
- 2026-06-29: align live verification expectations with the persistent
  Postgres-backed stack and `online_lan.mjs`

## Requirement addendum

- Before a non-threatening quest pull, the bot may spend a short bounded prep
  window refreshing class buffs, summoning a missing warlock pet, drinking to
  restore mana, or using equivalent class-safe preparation actions.
- Progression arbitration must prefer a currently actionable quest objective
  over fallback grinding or a deferred higher-risk route. Safety defers remain
  valid, but they should only win when no other actionable quest work exists.
- Travel, combat setup, and object interaction should stay reconstructible from
  live route goals rather than long blind forward movement. Arrival thresholds
  and pickup ranges must be tight enough to avoid skipping corners or
  interacting too early.
- Looting must respect visible tap and loot rights so bots do not waste actions
  on kills owned by other players.
- Live acceptance and admin smoke for ambient-player-bot behavior now run
  against the persistent Postgres-backed stack through `npm run db:up`,
  `node scripts/online_lan.mjs --restart`, and
  `node scripts/ambient_bot_admin_smoke.mjs`.

## Design notes

- `server/ambient_bots/pre_combat.ts` is the dedicated bounded prep helper. The
  progression brain calls it before safe route targets instead of inlining
  class-specific preparation branches throughout `brain.ts`.
- `server/ambient_bots/brain.ts` now drives quest combat and object travel
  through path goals so hosted play and ambient-player-bot execution share the
  same travel semantics between slower decision ticks.
- Objective selection keeps the safety defer layer for level-gated or risky
  routes, but it now resolves actionable live quest work before fallback grind
  objectives. This prevents mixed quest logs from stalling on outdated boar
  grinding when work such as `q_greyjaw` is already available.
- Snapshot enrichment for XP, equipment, stats, weapon data, and loot-right
  visibility stays inside the real runtime state and supports both ambient bots
  and hosted-play reuse without bypassing server authority.

## Current open design questions

- The packet is complete through `q_gravewyrm`, but the early Continuation 01
  to 03 QA rows are still marked pending in `progress.md`. Closing or
  superseding those historical QA rows needs an explicit follow-up review.
- The long-term split between the in-process runtime and a future dedicated
  runner host remains open if scale or ops isolation later demands it.

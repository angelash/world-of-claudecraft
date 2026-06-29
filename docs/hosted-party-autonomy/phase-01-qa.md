# Phase 1 QA: Party-Fill Defaults

## Goal

Audit Phase 1 for correctness, missing tests, persistence regressions, and live
LAN/IP readiness.

## Checks

- Verify defaults are cooperative for new hosted preferences.
- Verify explicit saved solo preferences remain honored.
- Verify target party size is still constrained to 2 to 5.
- Verify invite commands do not fire while dead, in combat, not party leader, at
  target size, or on cooldown.
- Verify UI and API status reflect the same settings.
- Verify backend restart was performed and IP URLs are available.

## Validation

Run the Phase 1 validation commands again. If any code changes are made during
QA, restart the stack again and repeat live status verification.

## Commit

If QA fixes are needed, use a focused fix commit and push it.

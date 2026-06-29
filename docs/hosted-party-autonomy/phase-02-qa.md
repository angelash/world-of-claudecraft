# Phase 2 QA: Quest Intake

## Goal

Verify hosted quest intake and group-aware pursuit does not break the existing
ambient progression route.

## Checks

- Verify existing ambient brain tests still pass.
- Verify hosted pickup sweep does not cause infinite accept loops.
- Verify quest-log capacity is respected if the sim has a capacity limit.
- Verify hard quests are not pursued just because they are accepted.
- Verify group strength only counts nearby, alive, contributing members.
- Verify route labels and player-facing text remain localized at the boundary.

## Validation

Run the Phase 2 validation commands again. Add `tests/localization_fixes.test.ts`
if any new server text is emitted.

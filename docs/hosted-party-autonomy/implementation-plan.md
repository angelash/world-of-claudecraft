# Implementation Plan: Hosted Party Autonomy

## Canonical Workflow

Each phase follows this workflow:

1. Run `git status --short` before edits.
2. Read the phase prompt, `state.md`, and relevant source files.
3. Implement one focused slice.
4. Run the smallest targeted tests that prove the slice.
5. If backend runtime code changed, restart with
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`.
6. Verify LAN/IP access after restart when backend or startup behavior changed.
7. Update `progress.md` and `state.md`.
8. Stage explicit paths only, commit with Conventional Commits, and push.

## Phase Table

| Phase | Title | Scope | Validation |
|---|---|---|---|
| 1 | Party-fill defaults | Make cooperative hosted play the default, preserve settings, harden nearby invite behavior | hosted party, runtime, API tests, build server, restart |
| 1 QA | Party-fill QA | Audit defaults, persistence semantics, UI status, and invite edge cases | targeted tests plus live status |
| 2 | Quest intake | Add pickup sweep and group-aware pursuit scoring | ambient brain tests, hosted runtime tests |
| 2 QA | Quest QA | Verify all sensible local quests are accepted and hard quests are deferred or enabled by party strength | targeted route tests |
| 3 | Party chat | Extend hosted chat with leader plans, member acknowledgements, correction, praise, and behavior intents | party chat tests, hosted runtime tests, i18n guard if text changes |
| 3 QA | Chat QA | Verify chat lines are real party chat and influence behavior through validated intent | targeted tests plus live observation |
| 4 | Support roles | Polish buff, heal, tank, focus, regroup, and recovery behavior for hosted parties | group support tests, runtime tests |
| 4 QA | Support QA | Verify support coverage and no stutter-follow regressions | targeted tests |
| 5 | Live harness | Add scriptable LAN/IP hosted-play party-fill and progression harness | harness smoke, build server, stack restart |
| 5 QA | Harness QA | Verify harness produces concise artifacts and catches failures | real stack check |
| 6 | Level 20 run | Run and fix until one clean post-change pass reaches level 20 and completes pre-20 practical quests | long-run artifact and final gate |
| 6 QA | Final QA | Confirm final clean run, update docs, offer packet teardown | final matrix |

## Commit Cadence

Use one commit per completed phase or sub-slice:

- `docs(hosted-play): plan cooperative autonomy`
- `fix(hosted-play): default to cooperative party fill`
- `feat(hosted-play): sweep available quests before routing`
- `feat(hosted-play): couple party chat to group intent`
- `fix(hosted-play): polish cooperative support roles`
- `test(hosted-play): add live autonomy harness`
- `test(hosted-play): verify level 20 cooperative run`

## Stop Conditions

- Stop and ask if a change would require a destructive database migration.
- Stop and ask if fulfilling the target requires disabling server authority,
  sim determinism, rate limits, moderation, or ownership checks.
- Stop and report exact blockers if the stack cannot restart or ports remain
  owned by an external process.
- Do not mark the goal complete until the final level 20 run passes after the
  last code change.

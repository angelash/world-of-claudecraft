# Progress: Online Hosted Play

## Status table

| Phase | Status | Started | Completed |
|---|---|---|---|
| 1 | in_progress | 2026-06-27 |  |
| 2 | pending |  |  |
| 3 | pending |  |  |
| 4 | pending |  |  |
| 5 | pending |  |  |
| 6 | pending |  |  |

## Phase 1 checklist

- [ ] packet docs created
- [ ] hosted runtime module added
- [ ] `GameServer` hosted-play integration seam added
- [ ] owner API endpoints added
- [ ] game-menu owner controls added
- [ ] first live automation loop added
- [ ] manual-pause safety added
- [ ] targeted tests added
- [ ] validation green

Notes:
- Phase 1 is intentionally online-only and same-session only.
- The first live loop should reuse the ambient progression brain instead of
  inventing a second automation planner.

## Phase 3 checklist

- [ ] persistence schema landed
- [ ] per-character preference round-trip covered
- [ ] login resume policy implemented
- [ ] party support landed
- [ ] validation green

## Phase 5 checklist

- [ ] social shell landed
- [ ] bounded LLM overlay landed
- [ ] audit and fallback coverage landed
- [ ] validation green

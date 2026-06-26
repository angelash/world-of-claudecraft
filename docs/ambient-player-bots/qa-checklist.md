# QA Checklist: Ambient Player Bots

This checklist is for the final packet gate, not every intermediate commit.

## Core behavior

- [ ] A solo human typically receives the target ambient population near them.
- [ ] Nearby humans share ambient pods instead of multiplying linearly.
- [ ] Bots continue progressing when a human stops moving or leveling.
- [ ] Bots that travel too far from a human cluster log out cleanly and are
      replaced by suitable alternatives.

## Real-server integrity

- [ ] Bot accounts and characters are created through the real account and
      character APIs.
- [ ] Bot sessions join through the real WebSocket auth flow.
- [ ] Bot actions resolve through the normal command and input path.
- [ ] No client-trusted outcomes are introduced.

## Determinism and architecture

- [ ] `src/sim/` stays deterministic and model-agnostic.
- [ ] New server logic stays behind focused modules and thin bridges.
- [ ] No new nondeterministic calls land in simulation code.

## LLM safety

- [ ] Bot plan and social outputs are structured and validated.
- [ ] Budget, caching, and fallback behavior are visible to operators.
- [ ] Dynamic text never bypasses moderation or locale rules.
- [ ] The executor never gives the model direct authority over state mutation.

## Persistence and operations

- [ ] Registry tables upgrade additively on existing realms.
- [ ] Existing characters load unchanged.
- [ ] Runtime diagnostics expose cluster, assignment, and failure health.
- [ ] Kill switches and rollout controls work.

## Performance

- [ ] Cluster planning cost is cheap relative to the 20 Hz server loop.
- [ ] Session counts and snapshot costs remain within the chosen experiment
      budget.
- [ ] Provision and replacement loops do not thrash under load.

## Release gate

- [ ] targeted tests are green for each phase
- [ ] `node scripts/ambient_bot_admin_smoke.mjs` passes against a reachable realm
- [ ] CI-equivalent local gate is green before final release work
- [ ] rollout and rollback steps are documented

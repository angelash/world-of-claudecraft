# Ambient Bot Rollout Handoff

## Preconditions

- a reachable realm is running on the target host
- the operator has an admin account for `/admin/api/login`
- ambient bot experiment flags are set as intended for that realm
- the operator understands whether `AMBIENT_SMOKE_ALLOW_LOGOUT=1` is safe for
  the environment they are testing

## Recommended smoke sequence

1. Set `SERVER_URL`, `AMBIENT_ADMIN_USER`, and `AMBIENT_ADMIN_PASS`.
2. Run `node scripts/ambient_bot_admin_smoke.mjs`.
3. Review `/admin/api/ambient-bots` diagnostics for planner, runtime, and LLM
   state.
4. Only when safe, rerun with `AMBIENT_SMOKE_ALLOW_LOGOUT=1` to exercise the
   incident control path.

## Local workstation fallback

- When Docker or Postgres is unavailable locally, run
  `node scripts/ambient_bot_admin_smoke_pgmem.mjs`.
- The fallback boots a local realm through the normal server entrypoint with a
  `pg-mem` backing store, creates a temporary admin account, then reuses
  `scripts/ambient_bot_admin_smoke.mjs` against the real admin HTTP surface.
- Use this fallback to verify control-plane behavior before a staging or
  production smoke. It supplements a deployed-realm check, it does not replace
  one.

## Incident control sequence

1. POST `/admin/api/ambient-bots/control` with
   `{"acceptProvisionActions":false,"acceptLoginActions":false,"allowLlmDecisions":false}`.
2. POST `/admin/api/ambient-bots/logout-all` with a short reason string.
3. Verify `/admin/api/ambient-bots` shows zero active runners.
4. Restore controls once the incident drill or mitigation is complete.

## Rollback notes

- if the runtime surface is misbehaving, keep login and provisioning paused
  until the realm is restarted or the feature is disabled
- if the LLM surface is misbehaving, pause only `allowLlmDecisions` first so
  heuristic social fallback can continue
- if the planner is over- or under-populating, use
  `/admin/api/ambient-bots/config` to tune `soloTargetBots`,
  `maxBotsPerCluster`, or `maxProvisionPerTick` conservatively

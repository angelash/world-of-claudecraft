# Requirements: Hosted Party Autonomy

## Product Goal

When a player enables hosted play, the character should behave like a capable
real player in a cooperative MMO party. It should actively invite visible nearby
players until the configured party target is reached, keep filling while
questing, accept and coordinate with party members, pick up available quests
before committing to a route, complete practical objectives from simple to hard,
and keep progressing to level 20 without losing LAN/IP access or requiring the
operator to restart services manually.

## User Experience Requirements

### 1. LAN/IP Access Stays Intact

- The local stack must continue to be started and restarted through
  `scripts/windows_stack.ps1` or `scripts/online_lan.mjs`.
- Backend or startup-read changes must be followed by an automatic restart.
- Verification must confirm `5173` and `8787` listen on `0.0.0.0`, IP URLs are
  printed, and `/api/status` returns ok.
- Do not replace the fork-local LAN launcher with localhost-only commands.

### 2. Party Fill Is The Default Hosted Experience

- Hosted play should start in a cooperative posture by default.
- A hosted character should invite visible nearby players until the configured
  party target is reached.
- The default target for cooperative hosted play is a full party of 5.
- The UI must keep an explicit target-size control so the player can choose a
  smaller party when desired.
- The invite loop must continue while questing, not only before group or dungeon
  objectives.
- The hosted player must not invite while dead, in combat, not party leader, or
  already at target size.
- The hosted player should avoid spamming the same target with repeated invites.

### 3. Quest Intake And Route Choice

- Hosted play should pick up all currently available sensible quests before
  leaving an area for a longer objective.
- Ready quests should still be turned in promptly when that is more efficient
  than detouring for new pickups.
- Active quests should be prioritized from simple to hard, considering level,
  quest requirements, travel distance, objective type, party size, class role,
  and party composition.
- If a quest is too dangerous solo but practical with the current party, hosted
  play may pursue it earlier than the solo route would.
- If a quest remains too dangerous even with the party, hosted play should
  level, gear, resupply, or finish easier active quests first.
- Hosted play should avoid leaving pickup quests unaccepted when it is already
  near their quest giver and has room in the quest log.

### 4. Cooperative Tactics

- The party should use normal server commands for targeting, following,
  assisting, attacks, abilities, healing, buffs, rests, vendor stops, quest
  accepts, and turn-ins.
- Party members should collapse onto shared focus targets instead of splitting
  damage without cause.
- Tank-capable characters should protect healers and fragile allies.
- Healer-capable characters should prioritize wounded or threatened allies.
- Non-tank members who are threatened at dangerous health should stop attacking,
  clear unsafe targets, use a healing potion when available, and collapse back
  toward the tank or leader before resuming damage or quest actions.
- Buff-capable characters should apply practical party buffs before pulls.
- The group should hold briefly for regrouping, recovery, buffs, and summons
  before harder pulls.
- The group should keep questing after combat, looting, deaths, resupply, or
  party-size changes.

### 5. Watchable Social Realism

- Party chat should be frequent enough to feel alive but not so frequent that it
  becomes spam.
- The party should discuss quest goals, route choices, pull plans, focus
  targets, buffs, healing, mistakes, and recoveries.
- Party members should encourage and praise useful actions.
- Party members should gently correct unsafe or ineffective behavior, such as
  pulling early, breaking follow, splitting targets, ignoring low health, or
  running ahead.
- Chat should influence behavior through explicit runtime state, such as a
  hold, regroup, focus, buff, heal, or route intent.
- Template fallback is required even when LLM overlays are disabled or denied.
- LLM output, if enabled, may shape phrasing only. It must not directly control
  authoritative gameplay.

### 6. Live Validation Target

- Start the persistent LAN/IP stack.
- Enable hosted play in the real client path.
- Observe active nearby invites until the target party is reached.
- Observe quest pickup behavior before leaving the local quest hub.
- Observe party chat lines that correspond to actual behavior.
- Observe support roles using buffs, healing, tanking, and focus fire.
- Observe low-health self-preservation during combat: threatened damage dealers
  and healers should not keep attacking or turning in while nearly dead.
- Run one uninterrupted validation that reaches level 20 and completes every
  currently practical pre-20 quest.
- If any logic changes during validation, restart the affected services and run
  the validation again until the final pass is clean.

## Non-Functional Requirements

- Keep `src/sim` deterministic and unaware of hosted play.
- Keep server authority intact.
- Keep hosted behavior reconstructible from live state, persisted preferences,
  and bounded runtime memory.
- Keep UI strings localized through existing `t()` keys.
- Keep player-shown server text localized through client boundary matchers.
- Keep tests focused and meaningful for every new helper.
- Preserve unrelated user work, use explicit git paths, commit in small slices,
  and push each completed slice.

## Acceptance Criteria

- The default hosted preferences make cooperative party fill available without
  the player discovering multiple hidden toggles.
- The hosted panel clearly exposes auto invite and target party size.
- A hosted character invites visible nearby characters until the target size is
  met, stops at the target, and resumes inviting if the party drops below it.
- A hosted party accepts, picks up, completes, and turns in pre-20 quests in a
  sensible order.
- Party strength and composition lower risk thresholds without removing all
  safety gates.
- Party chat lines are visible through the real party channel and map to real
  decisions.
- Buff, heal, tank, focus, regroup, and recovery behavior all appear during the
  long-run validation.
- The final validation is a single clean hosted run to level 20 after the last
  code change.

# Brainstorm And Gap Analysis

## Current State

Hosted play already runs inside the real online session. It builds a live
state, reuses the ambient bot progression brain, applies normal movement input
and commands, exposes a debug panel, and has same-session safety.

The hosted party coordinator already supports several useful pieces:

- It accepts party invites in `follow_leader` mode.
- It uses the real `/follow <leader>` chat path.
- It assists party members under attack.
- It reuses ambient group support for buffs, healing, tanking, and focus fire.
- It can invite nearby visible players when `autoInviteNearbyPlayers` is true.
- It respects the configured target party size.

The main gap is product posture. Current default preferences are solo-oriented:

- `partyMode` defaults to `solo`.
- `autoInviteNearbyPlayers` defaults to `false`.
- `autoInviteNearbyTargetPartySize` defaults to `2`.

This makes the feature technically present but easy to miss. It also means the
runtime does not yet express the user's desired hosted-play fantasy: start
hosted play, group up, talk, coordinate, and keep progressing together.

## Reusable Systems

- `server/hosted_play/runtime.ts`: same-session hosted runtime and debug status.
- `server/hosted_play/party.ts`: hosted invite, accept, follow, assist, regroup,
  and party support overlay.
- `server/ambient_bots/brain.ts`: quest, travel, combat, loot, recovery,
  vendor, and route selection.
- `server/ambient_bots/progression_routes.ts`: level 1 to 20 route registry.
- `server/ambient_bots/group_support.ts`: party buffs, healer response, tank
  response, and focus-fire support.
- `server/ambient_bots/party_roles.ts`: shared role planning.
- `server/ambient_bots/party_chat.ts`: leader briefings and follower acks.
- `server/ambient_bots/social.ts`: bounded social shell and reply handling.
- `src/ui/hosted_play_panel.ts`: hosted settings and debug details.
- `src/hosted_play_settings.ts`: target party size constants and validation.
- `tests/hosted_play_party.test.ts`: fast coordinator coverage.
- `tests/ambient_player_bot_brain.test.ts`: quest-route behavior coverage.
- `tests/ambient_player_bot_party_chat.test.ts`: party chat shell coverage.
- `scripts/windows_stack.ps1`: agent-maintained LAN/IP restart path.

## Design Ideas To Carry Forward

- Treat cooperative hosted play as the default path, while keeping the explicit
  settings for players who want solo mode or a smaller target.
- Add a hosted-specific quest planner layer around the ambient brain rather than
  hardcoding a second quest brain.
- Keep route records declarative. Add metadata for pickup clusters, risk,
  group value, and pre-20 completion checks only when tests need it.
- Let party chat write small intent records, such as "hold for buffs", "assist
  tank", "finish nearby pickups", or "recover first". The gameplay layer reads
  the validated intent. Chat never directly mutates sim state.
- Make live validation scriptable. The long-run check should produce a concise
  artifact with level, quests done, active quests, party size timeline, invite
  count, chat count, support actions, deaths, stuck resets, and final verdict.
- Use deterministic templates for fallback social lines. LLM can rephrase, but
  the system must feel alive without it.

## Risks And Mitigations

- Risk: full-party default may surprise a player who expected solo automation.
  Mitigation: keep a visible solo/cooperative mode and target-size control.
- Risk: auto-invite may spam strangers or invite inappropriate targets.
  Mitigation: keep range, leadership, combat, dead, target cooldown, and target
  party size guards. Add tests for cooldown and party-leader cases.
- Risk: quest intake may accept too many hard quests and create unsafe loops.
  Mitigation: separate "accept if nearby and eligible" from "pursue now", then
  use risk scoring for pursuit.
- Risk: chat can become cosmetic only.
  Mitigation: chat shell must emit bounded intents that tests assert are read by
  the party and quest layers.
- Risk: long-run validation can be flaky if it depends on manual observation.
  Mitigation: create a real-stack harness with machine-readable summaries and
  keep manual browser verification as a supplementary check.

## Deferred Vision

The user eventually wants a wider living ecology where every created character,
NPC, and monster feels like part of a simulated world. That is intentionally
outside this packet. This packet focuses on making hosted party play feel like
real players first, because that creates the visible cooperative layer the
larger ecology can later build on.

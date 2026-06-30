# Design: Hosted Party Autonomy

## Architecture Summary

Hosted party autonomy stays a server-side overlay on the live player session.
It does not create a second login. It does not mutate sim state directly. It
reads the live world snapshot, decides what a believable hosted player would do,
and emits normal movement input plus normal server commands.

The target architecture has four layers:

- Preference layer: default cooperative settings, persisted per character.
- Party layer: invite, accept, follow, regroup, support, and role plan.
- Quest layer: intake all eligible local quests, then choose pursuit by risk.
- Social layer: party chat and validated intent that influences the above.

## Preference Contract

Default hosted behavior should favor cooperative party fill:

- `partyMode`: `follow_leader`
- `autoInviteNearbyPlayers`: `true`
- `autoInviteNearbyTargetPartySize`: `5`
- `actionLogEnabled`: `true`
- `resumeOnLogin`: `false`

Existing characters with explicit saved preferences should keep those choices.
If a saved row has only legacy defaults because the player never configured the
feature, the migration path may normalize through default-read behavior or a
small additive preference version. Any persisted shape change must be backward
compatible and covered by tests.

## Party-Fill Contract

The hosted player invites visible nearby candidates when all conditions are
true:

- auto invite is enabled
- the player is alive
- the player is out of combat
- the party is absent or the hosted player is the party leader
- the current party size is below target
- the party size is below the hard cap of 5
- the candidate is visible, alive, not self, and not already in the party
- the candidate has not been invited within the per-target cooldown
- the global invite cooldown has elapsed

The invite target selection should prefer nearby, eligible, useful candidates.
The first implementation can keep nearest-first. Later slices may add class
composition scoring.

## Combat Recovery Contract

Combat coordination should prevent fragile members from continuing ordinary
quest brain behavior when they are nearly dead. After normal healer support and
tank protection have a chance to act, a non-tank member who is threatened at
dangerous health should:

- use the best available healing potion
- stop auto attacking
- clear its hostile target
- travel back toward the tank, or the leader if no tank anchor is available
- pause ordinary focus-fire and quest actions until it stabilizes

When party recovery is active because any member is dead or below the recovery
threshold, healthy hosted damage dealers also pause ordinary focus fire. The
hosted recovery threshold is intentionally early for low-level play: about 72
percent health, with healing potion use below about 65 percent when one is
available. That keeps the party from treating recovery chat as flavor while
some members keep pulling pressure onto a collapsing fight. Heals,
self-preservation, and tank protection still run before this pause so the group
can save an ally instead of standing idle.

When party correction asks the team to regroup, a distant follower returns to
the leader before ordinary support, combat, restock, or quest brain continues.
This also applies while the follower is already in combat, because bringing the
danger back to the tank is safer than letting a cloth or healer continue a
split pull.

This is a behavior rule, not just party chat flavor. Recovery and correction
lines should reflect the same underlying state so the run looks and behaves
like players calling a reset.

## Quest Intake Contract

The quest layer should distinguish two operations:

- Intake: accept eligible quests when the character is near the giver and has
  enough quest-log capacity.
- Pursuit: choose which accepted or ready quest to actively complete now.
- Distant pickup: choose a far-away giver only when the character meets the
  route's original safe pickup level, without applying nearby party bonuses.

The ambient brain currently chooses one ready, active, or available route from
`AMBIENT_BOT_SOLO_QUEST_ROUTES`. Hosted autonomy should add a focused wrapper
that can perform pickup sweeps without breaking the existing route brain.

Pursuit scoring should consider:

- quest minimum level
- route `pursueAtLevel`
- suggested party size
- current party size
- class composition and role coverage
- objective type, such as kill, collect, dungeon, elite, or boss
- travel distance and hub locality
- prerequisites and chain position
- active quest overlap in the same area
- current supplies, health, mana, and equipment readiness

The first scoring rule can be conservative. Party strength should lower the
solo safety threshold only when party members are nearby, alive, and able to
contribute. That party bonus applies to pursuing accepted work, not to sending
an underlevel group across the map to pick up a new quest.

## Social Intent Contract

Party chat should be real chat sent through the normal party channel. It must
not inject privileged system messages.

The chat shell may produce a bounded social intent object. Examples:

- `regroup`: hold for distant party members.
- `buff`: finish buffs and recovery before pull.
- `focus`: assist a named member or target.
- `heal`: protect a wounded or threatened ally.
- `route`: finish pickups, then pursue a named quest.
- `correction`: recover from unsafe behavior, such as early pulls or split
  targets.

Only validated intent values are consumed by gameplay layers. Free-form text is
never parsed as authority. LLM output can choose wording, but the deterministic
state machine chooses behavior.

## Watchability Contract

The player should be able to watch the run like a live cooperative session:

- The action log explains major automation goals.
- Party chat explains group intent in short player-like lines.
- The debug panel shows group mode, leader, distance, suggested party size, and
  current objective.
- The live harness captures invite, chat, support, quest, death, stuck, and
  progression timelines.

## Validation Design

Fast validation uses unit and integration tests:

- hosted party coordinator tests
- hosted runtime tests
- hosted API tests
- ambient brain tests for quest intake and risk scoring
- ambient party chat tests
- localization guard when player-visible text changes
- `npm run build:server` for backend slices

Live validation uses the persistent LAN/IP stack:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart`
- `node scripts/online_lan.mjs urls`
- `/api/status`
- a new hosted-play live harness for party fill and level 1 to 20 progression

Backend changes are not considered live until the stack is restarted and the
live path is verified.

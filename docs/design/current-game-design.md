# Current Game Design Overview

This document is the current, code-aligned game design overview for World of
ClaudeCraft. It describes what is implemented today, not a new target spec.
When this document disagrees with source data, the source data wins.

Last inspected: 2026-06-20.

Primary content sources:

- `src/sim/content/classes.ts`
- `src/sim/content/zone1.ts`
- `src/sim/content/zone2.ts`
- `src/sim/content/zone3.ts`
- `src/sim/content/dungeons.ts`
- `src/sim/content/temple.ts`
- `src/sim/content/items.ts`
- `src/sim/content/talents*.ts`
- `src/sim/content/augments.ts`
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `README.md`

## Existing Documentation Audit

The repository already has strong design coverage, but it is split by feature
or implementation phase:

| File | Coverage | Gap for planning work |
|---|---|---|
| `README.md` | Player-facing overview, hosting, current feature tour, controls, classic fidelity checklist. | Good for onboarding, but not a design bible. |
| `docs/design/master-spec.md` | Original level 6-20 expansion plan: Gravecaller story, Mirefen, Thornpeak, XP math, dungeon and item targets. | It is an expansion spec, not a current-state summary. Current code now includes additional content such as Drowned Temple and Nythraxis hooks. |
| `docs/design/spell-ranks.md` | Vanilla-style ability rank plan for levels 1-20. | Useful reference, but current kits now include additional class features, pets, forms, talents, and high-band abilities. |
| `docs/prd/talents-and-specializations.md` | Talent system requirements, architecture, persistence, UI, and acceptance criteria. | Feature-specific, not full game design coverage. |
| `docs/prd/max-level-xp-overflow.md` | Lifetime XP, virtual levels, prestige and post-cap progression requirements. | Feature-specific. |
| `docs/design/icon-system.md` | Procedural icon architecture and visual recipes. | Presentation-only. |
| `docs/design/graphics-plan.md`, `lookdev-hookup.md`, `ue5-overhaul-plan.md` | Rendering, lookdev, assets, visual pipeline. | Presentation-only. |
| `docs/design/sound_effects.md`, `npc_voices.md` | Audio catalog and voice prompt direction. | Presentation-only. |
| `docs/prd/woc/*.md` | Wallet link and holder flair feature specs. | Web3/cosmetic feature-specific. |

The missing document was a single current-state planning overview that ties the
implemented world, progression, classes, encounter structure, economy, social
systems, PvP modes, and presentation direction together. This file fills that
gap.

## Product Pillars

World of ClaudeCraft is a classic-style micro-MMO and deterministic simulation
sandbox. The same `src/sim` core runs offline, online, and in the headless RL
environment.

Design pillars:

- Classic-era MMO feel in miniature: tab-target combat, quests, zones, hubs,
  corpse loot, vendors, party dungeons, social friction, and readable downtime.
- Deterministic simulation: fixed 20 Hz tick, seeded RNG, server-authoritative
  online play, and reproducible headless runs.
- Low-cap progression density: level 1-20 is the full current real-level band,
  with overlapping zones and dungeon capstones instead of a long empty climb.
- All nine classic classes: distinct resources, role fantasy, ability ranks,
  class kits, and a three-spec talent structure per class.
- Party-first but solo-readable: the main story can be followed solo through
  lead-up chains, while key bosses and dungeons provide 5-player peaks.
- Procedural presentation: icons, geometry, weather, music, SFX, creature rigs,
  UI chrome, and many visuals are generated or data-driven rather than asset
  heavy.
- Social sandbox edges: parties, chat, trade, duels, ranked arenas, Fiesta,
  world market, AFK/DND, rolls, and cosmetics give the small world MMO texture.

## Current Content Inventory

Current inspected counts:

| Content area | Count |
|---|---:|
| Real level cap | 20 |
| Total XP to level 20 | 167,200 |
| Player classes | 9 |
| Ability definitions | 152 |
| Talent trees | 9 |
| Talent nodes | 26 per class |
| Quests | 89 |
| Solo quests | 74 |
| 2-player quests | 2 |
| 3-player quests | 3 |
| 5-player quests | 10 |
| Mob templates | 104 |
| NPCs | 21 |
| Items | 319 |
| Camps | 79 |
| Ground quest objects | 18 |
| Road splines | 14 |
| Dungeons or dungeon-like instances | 5 |
| Fiesta augments | 20 |
| Fiesta power-ups | 4 |
| Fishing tables | 3 |

Some chain-gated quests omit an explicit `minLevel` and therefore default to
level 1 in raw data. Treat quest-chain requirements and zone placement as the
practical pacing for those quests.

## World And Narrative

The main world is three connected open zones arranged along the z axis. The
story spine is the Gravecaller conspiracy: unrest in Eastbrook leads to Morthen,
Morthen points to Vael in the marsh, and Vael reveals Korzul beneath Thornpeak.

| Zone | Level band | Biome | Hub | Key POIs | Design role |
|---|---:|---|---|---|---|
| Eastbrook Vale | 1-7 | Vale | Eastbrook | Eastbrook, Wolf Run, Boar Meadow, Mirror Lake, Webwood, Copper Dig, Bandit Camp, Fallen Chapel, Brightwood Glade | Starter zone, town social center, first class learning, first rare mobs, first dungeon hook. |
| Mirefen Marsh | 6-13 | Marsh | Fenbridge | Fenbridge, Prowler Reeds, Deepfen Shallows, Widow Thicket, Drowned Chapel, Troll Mounds, Gravecaller Encampment, The Sunken Bastion | Middle band with overlapping entry from Eastbrook, stronger debuffs, cult escalation, level 13 dungeon capstone. |
| Thornpeak Heights | 13-20 | Peaks | Highwatch | Highwatch, Stalker Ridge, Deeprock Burrows, Ogre Foothills, Drogmar's War-Camp, Stormcrag, The Glimmermere, Wyrmcult Tents, Revenant Fields, Gravewyrm Sanctum | High-band and endgame zone, main-story finale, optional Drowned Temple arc, post-cap hooks. |

### Story Arcs

Main arc: Gravecaller conspiracy

- Eastbrook Vale: Marshal Redbrook and Brother Aldric establish the town,
  local threats, the restless dead, and the Gravecaller sigil.
- Hollow Crypt: Brother Aldric's chain resolves into Sexton Marrow and Morthen
  the Gravecaller under the Fallen Chapel.
- Mirefen Marsh: Fenbridge quests expose drowned dead, trolls, cultists,
  summoners, Deacon Voss, Knight-Commander Olen, and Vael the Mistcaller.
- Thornpeak Heights: Highwatch quests reveal the Wyrmcult, storm elementals,
  revenants, and the seal around Gravewyrm Sanctum.
- Gravewyrm Sanctum: Korgath, Grand Necromancer Velkhar, and Korzul the
  Gravewyrm close the main level 1-20 story.

Side arc: Drowned Moon

- Starts at The Glimmermere in Thornpeak with Ondrel Vane, Tidewatcher.
- Focuses on moongate activity, Glimmermere Waders, the Drowned Choir,
  Sethrael the Palecoil, and the Drowned Temple.
- Culminates in Choirmother Selthe and Ysolei, Avatar of the Drowned Moon.
- It is parallel to the Gravecaller plot and fills the level 15-18 dungeon
  space with rare gear.

Post-cap hook: Nythraxis / Abandoned Crypt

- Current code registers four level 20 quests:
  `q_nythraxis_restless_dead`, `q_nythraxis_graves`,
  `q_nythraxis_sealed_crypt`, and `q_nythraxis_bound_guardian`.
- The Abandoned Crypt is registered as `nythraxis_crypt` with 3 object pickups,
  suggestedPlayers 1, and no dungeon spawns.
- The chain also references a 5-player Bound Guardian step in open-world data.
- Treat this as a live post-cap hook or partially implemented questline, not as
  a complete combat dungeon.

## Progression Design

### Levels And XP

The real level cap is 20. The XP table follows classic-style low-level pacing:

`400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400,
12900, 14400, 16000, 17700, 19400, 21300, 23200`

Design notes:

- Total XP to reach level 20 is 167,200.
- Mob XP uses classic-style level difference and gray cutoff rules.
- Party XP uses vanilla-inspired group bonuses for 3, 4, and 5 players.
- Quest rewards carry most structured progression, while dungeon trash is more
  about loot, story, and party pacing than grinding efficiency.
- Rested XP accrues while resting in inn footprints, fills 5 percent of a level
  per 8 in-game hours, and caps at 1.5 levels of XP.

### Level Bands

The zone bands intentionally overlap:

- Eastbrook Vale: 1-7.
- Mirefen Marsh: 6-13.
- Thornpeak Heights: 13-20.
- Drowned Temple arc: starts around level 15, with 5-player steps at 16+.
- Gravewyrm Sanctum finale: level 18+ quests, level 20 enemies.
- Nythraxis hook: level 20.

This overlap gives players room to move forward before finishing every local
quest and lets group content sit beside solo chains rather than blocking them.

### Post-Cap Progression

At level 20, the real level bar is capped, but lifetime XP continues.

Implemented post-cap concepts:

- Virtual level derives from lifetime XP and can continue beyond the real cap.
- Prestige rank cost uses 23,200 XP per rank.
- Milestone rewards are data-defined:

| Milestone | Lifetime XP | Reward kind |
|---|---:|---|
| Veteran | 250,000 | Title |
| Champion | 500,000 | Title |
| Paragon | 1,000,000 | Border |
| Mythic | 2,500,000 | Border |
| Eternal | 5,000,000 | Title |

## Classes And Combat Roles

All nine classic classes are present. Each class has a base kit, ability ranks,
and one talent tree with three specs.

| Class | Resource | Ability count | Current kit identity |
|---|---|---:|---|
| Warrior | Rage | 16 | Melee weapon pressure, shouts, charge, rage spenders, defensive stance, sunder, taunt. |
| Paladin | Mana | 13 | Hybrid melee, seals and judgement, holy healing, armor aura, blessings, absorbs, threat and retaliation auras. |
| Hunter | Mana | 14 | Ranged pressure, aspects, stings, shots, melee fallback, tame/dismiss/revive pet, burst cooldown. |
| Rogue | Energy | 21 | Energy and combo points, stealth openers, finishers, poisons, control, vanish, burst windows. |
| Priest | Mana | 10 | Smite and shadow damage, shields, renew, single-target heals, Mind Blast, Mind Flay, Flash Heal. |
| Shaman | Mana | 11 | Lightning caster, weapon imbues, shocks, shields, healing, Ghost Wolf, Stormstrike. |
| Mage | Mana | 14 | Fire/frost/arcane nukes, conjured food and water, crowd control, roots, barrier, big casts. |
| Warlock | Mana | 17 | DoTs, life tap, drain, fear, demons from Imp through Doomguard, shadow/fire nukes. |
| Druid | Mana plus forms | 31 | Caster/healer baseline, Bear Form, Wolf Form, stealth, combo finishers, travel utility, hybrid tools. |

### Talent Structure

Talent points start at level 10. At level 20, a player has 11 talent points.
Each class has 26 nodes and three specs:

| Class | Specs |
|---|---|
| Warrior | Arms DPS, Fury DPS, Protection tank |
| Paladin | Holy healer, Protection tank, Retribution DPS |
| Hunter | Beast Mastery DPS, Marksmanship DPS, Survival DPS |
| Rogue | Assassination DPS, Combat DPS, Subtlety DPS |
| Priest | Discipline healer, Holy healer, Shadow DPS |
| Shaman | Elemental DPS, Enhancement DPS, Restoration healer |
| Mage | Arcane DPS, Fire DPS, Frost DPS |
| Warlock | Affliction DPS, Demonology DPS, Destruction DPS |
| Druid | Balance DPS, Feral tank, Restoration healer |

Talent allocations are server-authoritative in online play. They are
precomputed into flat modifiers so combat and stat hot paths do not walk the
tree every tick. Players can save up to 10 loadouts.

## Combat Model

Core combat rules:

- Fixed 20 Hz simulation tick.
- 1.5 second global cooldown, with rogue-specific faster pacing where defined.
- Weapon swing timers and on-next-swing style attacks.
- Rage, mana, energy, combo points, auras, forms, stealth, pets, absorbs,
  dots, hots, roots, stuns, incapacitate, polymorph, fear, silence, blind,
  disarm, expose, lockout, vulnerability, and other debuffs.
- Cast pushback delays casts by 0.5 seconds per hit.
- Channel pushback shaves 25 percent off a channel per hit.
- Classic stat feel: stamina and intellect conversion, armor damage reduction,
  spell hit, melee miss/dodge, rage conversion, threat, and five-second mana
  rule.
- Eating and drinking restore over 18 seconds while sitting and break on damage
  or standing.

Mob behavior:

- Idle wandering, proximity aggro, social pulls, chase, attack, flee/evade,
  leash reset, corpse loot, respawns, and rare timers.
- Elite mobs use roughly 2.3x health, 1.5x damage, and double XP.
- Boss and rare mechanics include AoE pulses, add summons, enrages, stomps,
  cleaves, mortal wounds, thorns, poisons, bleeds, blinds, heals, wards,
  mana burns, silences, spell vulnerability, and other affixes.

## Quest Design

Quest objective types are deliberately simple:

- Kill objectives.
- Collect objectives from quest-gated drops.
- Collect objectives from ground objects.
- Chain gates through `requiresQuest`.
- Level gates through `minLevel`.
- Group guidance through `suggestedPlayers`.

Design intent:

- Starter quests teach basic combat, looting, vendors, ground objects, and zone
  geography.
- Zone 2 and zone 3 chains deepen mob mechanics and debuff literacy.
- Group quests are visible as peaks, but most story lead-up remains soloable.
- Class-archetype rewards keep item tables compact while giving every class a
  relevant reward.
- Ground sparkle pickups are used for story beats, breadcrumbs, and non-combat
  rhythm.

Quest group mix:

- 74 solo quests.
- 2 quests tuned for 2 players.
- 3 quests tuned for 3 players.
- 10 quests tuned for 5 players.

## Dungeons And Major Encounters

| Instance | Level role | Suggested players | Interior | Spawns | Major encounters | Current design note |
|---|---|---:|---|---:|---|---|
| The Hollow Crypt | Eastbrook capstone, around 7-10 | 5 | Crypt | 13 | Sexton Marrow, Morthen the Gravecaller | First full-party dungeon and first Gravecaller payoff. Morthen uses Shadow Pulse. |
| The Sunken Bastion | Mirefen capstone, around 12-13 | 5 | Crypt | 13 | Knight-Commander Olen, Vael the Mistcaller | Vael uses Mist Surge and summons Drowned Thralls at HP thresholds. |
| Gravewyrm Sanctum | Main-story finale, level 20 | 5 | Sanctum | 21 | Korgath the Bound, Grand Necromancer Velkhar, Korzul the Gravewyrm | Final Gravecaller dungeon. Korgath and Korzul enrage, Velkhar summons adds, Korzul uses Necrotic Shockwave. |
| The Drowned Temple | Side-story dungeon, around 16-18 | 5 | Temple | 17 | Choirmother Selthe, Ysolei | Separate Drowned Moon arc. Ysolei uses Lunar Tide, summons Moonspawn, and enrages. |
| Abandoned Crypt | Level 20 Nythraxis hook | 1 | Crypt | 0 | None in instance data | Object-only instance with three pickups. Current combat payoff lives outside this dungeon registration. |

Dungeon design principles:

- Private instances are keyed by party or solo entry.
- Full-party instances warn if entered under the suggested size rather than
  hard-blocking.
- Trash packs are spaced for classic pull rhythm.
- Dungeon trash does not respawn until the instance resets.
- Bosses are deterministic and use explicit data-driven mechanics.

## Items, Gear, And Economy

Current item counts:

| Kind | Count |
|---|---:|
| Weapon | 72 |
| Armor | 122 |
| Food | 18 |
| Drink | 8 |
| Tool | 18 |
| Junk | 27 |
| Potion | 6 |
| Elixir | 1 |
| Quest | 47 |

Current quality counts:

| Quality | Count |
|---|---:|
| Poor | 26 |
| Common | 66 |
| Uncommon | 86 |
| Rare | 77 |
| Epic | 20 |
| No explicit quality | 44 |

Economy rules and design:

- Currency uses copper internally and displays as gold, silver, copper.
- Vendors sell food, drink, white gear, and zone-appropriate upgrades.
- Junk items provide coin pacing and bag pressure.
- Quest items are non-economic and sell for 0.
- Quest rewards and dungeon drops carry most gear excitement.
- Food and drink support downtime pacing.
- Potions restore instantly and are usable in combat.
- Elixirs are temporary stat buffs.
- The World Market is anchored to The Merchant and supports player listings.
- Market rules include 12 active listings per seller, a 5 percent market cut,
  48-hour listing duration, a 500g price ceiling, and range-gated interaction.

Fishing:

| Zone | Fishing table |
|---|---|
| Eastbrook Vale | Mirror trout, river perch, tangled weed, rare Glimmerfin Koi, or nothing. |
| Mirefen Marsh | Marsh pike, bog eel, soggy boot, tangled weed, rare Glimmerfin Koi, or nothing. |
| Thornpeak Heights | Frostgill trout, stonescale carp, tangled weed, rare Glimmerfin Koi, or nothing. |

## Social And Multiplayer Systems

Online play is server-authoritative. Players have accounts, persistent
characters, and interest-scoped world snapshots.

Implemented social systems:

- Parties up to 5 players.
- Party kill credit, tap sharing, XP split, minimap blips, party frames, and
  party chat.
- Party loot strategies: fair-split currency by default, random common and
  premium item assignment by default.
- Player trade with item and money staging, both-side confirm, range checks,
  and atomic server validation.
- Duels with 3-second countdown, no-death finish at 1 HP, and 60-yard forfeit
  distance.
- Chat channels: say, yell, whisper, general, party, guild, officer, world,
  LFG, emote, and roll events.
- Server-side friends, ignore, guild roster, presence, guild chat, and officer
  chat.
- AFK and DND session status with automatic whisper responses.
- Raid/target markers as cosmetic party-scoped overlays.

## PvP And Fiesta

Ashen Coliseum supports arena formats:

- Ranked 1v1.
- Ranked 2v2.
- Unranked 2v2 Fiesta.

Ranked arena design:

- Base rating is 1500.
- Minimum rating is 100.
- Elo K factor is 32.
- Match countdown is 5 seconds.
- Maximum match duration is 150 seconds.
- If time expires, the match resolves by HP percentage.
- The live ladder sends up to 10 entries.

Fiesta design:

- 2v2 party mode.
- Everyone is standardized to level 20 with a default build for balance.
- First team to 15 takedowns wins.
- Maximum duration is 360 seconds.
- Three augment waves open during the fight.
- A shrinking ring starts at radius 22 and can close to radius 6.
- Standing outside the ring deals 6 percent max HP per second.
- Respawns start at 3 seconds and scale up to a 14 second cap.
- Power-ups spawn with telegraphs and short durations.

Fiesta augments:

- 20 augments across silver, gold, and prismatic tiers.
- Examples: Brutality, Spellfire, Toughness, Mending, Warlord's Might,
  Arcane Surge, Vampirism, Lightwell, Apex Predator, Archmage, Avatar of War,
  Ascendant.

Fiesta power-ups:

- Speed Demon, 12 seconds.
- Colossus, 14 seconds.
- Moon Boots, 14 seconds.
- Berserker, 10 seconds.

## Pets, Forms, And Class-Specific Systems

Hunter pets:

- Hunters can tame, dismiss, and revive pets.
- Pet modes include passive, defensive, and aggressive.
- Pets can assist, follow, teleport back when too far away, and use Growl-like
  threat control.

Warlock demons:

- Warlocks summon demons from Imp at level 1 through Doomguard at level 20.
- Demon roles include ranged DPS and tank-style companions.

Druid forms:

- Bear Form establishes tanking tools such as Maul, Growl, and bear utility.
- Wolf Form carries the cat-form gameplay slot in current data: stealth,
  combo-style attacks, finishers, and mobility.
- Travel Form provides out-of-combat movement utility.

Rogue stealth and poisons:

- Rogue stealth enables openers such as Garrote, Cheap Shot, Ambush, and Sap.
- Poisons and finishers provide longer-form control and damage planning.

## Presentation Direction

Presentation is designed to read as a compact classic MMO:

- Three.js world renderer.
- Procedural terrain, roads, water, weather, props, buildings, vegetation, and
  creature rigs.
- Biome-specific look for vale, marsh, peaks, crypt, sanctum, and temple spaces.
- Procedural canvas icons for abilities, items, buffs, and debuffs.
- Classic HUD: unit frames, party frames, target frames, action bars,
  spellbook, character sheet, quest log, world map, minimap, bags, vendor,
  loot, tooltips, combat log, floating combat text, chat, XP bar, arena panel,
  and mobile controls.
- Procedural WebAudio for combat, UI, ambience, movement, and reward moments.
- NPC voice direction exists as prompt documentation, not as mandatory runtime
  voice playback.

Presentation reference docs:

- `docs/design/icon-system.md`
- `docs/design/graphics-plan.md`
- `docs/design/lookdev-hookup.md`
- `docs/design/ue5-overhaul-plan.md`
- `docs/design/sound_effects.md`
- `docs/design/npc_voices.md`

## Technical Design Constraints With Gameplay Impact

The planning layer should preserve these gameplay-facing constraints:

- Simulation is the source of truth. UI, render, and client glue must not mutate
  game state directly.
- All combat, loot, quest credit, economy, dungeons, trade, arena, and market
  outcomes resolve in the sim or authoritative server path.
- New randomness in simulation logic must use seeded RNG.
- New player-visible content in sim-side data must be localized at the client
  boundary through existing i18n matchers.
- New quests should use existing kill/collect objective types unless there is a
  strong design reason to expand the engine.
- New world content should prefer data-as-code in `src/sim/content` and avoid
  presentation dependencies in the sim.

## Known Design Gaps And Follow-Ups

These are planning-level gaps found while consolidating the current design:

1. `docs/design/master-spec.md` is older than some implemented content. It does
   not fully cover Drowned Temple, Nythraxis hooks, expanded class kits, Fiesta,
   world market, pets, rested XP, and the current post-cap data.
2. `docs/design/spell-ranks.md` remains a key ability-rank reference, but current
   class kits include systems beyond the original rank table.
3. `nythraxis_crypt` is registered as an object-only instance with no spawns.
   The related quest chain should be clarified as a post-cap object story, moved
   into a complete instance design, or documented as intentionally incomplete.
4. Quest counts and level pacing should be periodically regenerated from source
   data after content additions, because chain-gated quests can hide practical
   level requirements behind `requiresQuest`.
5. Item quality counts include 44 items with no explicit quality. That may be
   intentional for internal or legacy items, but content authors should decide
   whether future item rows should always specify quality.
6. The current design has several system-specific docs but no automated design
   index generated from `src/sim/content`. A future script could produce a
   content inventory table for this document or the wiki seed.

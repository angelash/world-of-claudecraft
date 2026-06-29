# Requirements: Ambient Player Bots

## Product goal

Build a real-server ambient population system that makes the online world feel
continuously inhabited by believable adventurers. Bots should register, create
characters, log in, quest, fight, level, travel, group, drift away, log out,
and get replaced through the same server surfaces that human players use.

## Player-experience requirements

### 1. Local-population illusion

- A solo human should usually see about five nearby bots.
- Two nearby humans should share one nearby bot population instead of doubling
  the count.
- Nearby bots should look busy: moving, fighting, looting, turning in quests,
  resting, shopping, or traveling.

### 2. Continuity and drift

- Bots should keep playing when the human stops leveling or stays in place.
- Bots may drift far enough away that the local visible count drops.
- When a cluster thins out, the system should refill it with believable
  replacements: returning travelers, existing higher-progress accounts that fit
  the zone, or fresh registrations and logins.
- Arrival and departure should feel natural. No teleport-to-player shortcuts.

### 3. Full-playthrough ambition

- The long-term target is not a starter-zone demo. Bots should eventually play
  from first login through the live quest ladder, including towns, travel,
  vendors, group quests, dungeons, and later zones.
- Progress must stay reconstructible from live world state plus persistent bot
  identity, not hidden privileged sim memory.

### 4. Social realism

- Players should eventually be able to add bots as friends, whisper them, party
  with them, and receive believable delayed replies or silence.
- Direct friend adds should behave like the live game surface, not like a
  pending friend-request workflow. When a real player adds a nearby ambient bot
  as a friend, the bot should mirror that add back so both sides settle into a
  stable friend state.
- Bot social behavior should remember lightweight prior interactions.
- Social realism must stay moderation-safe and operator-visible.
- When a real player invites an assigned nearby bot, the bot should accept the
  invite and behave like a follower instead of trying to become the party
  leader.

## Functional requirements

### A. Lifecycle orchestration

- Maintain a persistent registry of bot identities, accounts, characters,
  profiles, recent world state, assignments, and cooldowns.
- Cluster nearby humans and assign one shared ambient pod per cluster.
- Prefer handing off already-online bots before creating fresh churn.
- Use hysteresis: assignment radius, larger release radius, reservation TTLs,
  cooldowns, and staged replacement.

### B. Real-server execution

- Use the real `/api/register`, `/api/login`, `/api/characters`, and `/ws`
  flows.
- Use only normal player commands for movement, combat, chat, inventory, party,
  dungeon entry, and quest interaction.
- Preserve server authority. Bots must not get production-only sim mutation
  shortcuts.

### C. Progression behavior

- Drive bots with a bounded runtime brain that can quest, fight, loot, recover,
  vendor, regroup, and travel.
- Keep progression data-driven through route registries and named helpers, not
  deep special cases in `server/game.ts`.
- Support solo and grouped content, including dungeon entry, in-instance
  routing, encounter sequencing, regrouping, and exit flow.
- Grouped bots must complete practical pre-battle preparation through normal
  player commands: self prep, party-wide buffs where the class can provide
  them, tank-side readying, and healer-side top-offs before the pull resumes.
- Ambient-bot-led parties should derive one shared role split from current
  party composition, then use that same split for both tactical behavior and
  party-chat simulation.
- In ambient-bot-led parties, the leader should use the real party channel to
  call the plan: who is tanking, who is healing, when to regroup or finish
  buffs, and which target the party should focus.
- Ambient-bot followers in an ambient-bot-led party should acknowledge the
  leader's call in party chat and confirm their own responsibility instead of
  acting like a silent hivemind.
- For party invites, bots accept invites from same-cluster ambient peers and
  from their assigned player, while declining unrelated invites so a stale
  stranger invite does not block trusted grouping.
- Assigned-player party trust must come from a stable player identity that
  survives reconnects and live entity pid churn. The runtime must not rely on a
  live entity pid matching a stored character id when deciding whether to
  accept a real player's invite.
- Grouped bots preserve the server follow state by pausing brain movement while
  near the party leader.
- Grouped bots should converge on a shared combat focus target instead of
  free-splitting damage across multiple nearby enemies.
- Tank-capable grouped bots must reclaim loose mobs from healers or other
  fragile party members, establish threat on the shared focus target, and apply
  simple multi-target control when several nearby mobs are on the party.
- Healer-capable grouped bots must prioritize wounded or currently threatened
  allies ahead of general DPS behavior.
- Bots do not treat a real-player-led party as a bot-led party. They follow and
  assist, but do not wait for more members or invite others on behalf of the
  player.
- Player-led parties must stay player-led. Bots may follow, assist, and answer
  direct player instructions, but they must not inject bot-only roleplay or
  override the player's leadership tone with autonomous party chatter.

### D. Social and LLM behavior

- Keep low-level play heuristic and cheap.
- Use LLMs only for sparse planning, social intent, reply phrasing, and memory
  summarization.
- Ambient-bot party chat should be LLM-first when enabled and budget allows:
  short leader briefings and follower acknowledgements may be model-authored,
  but they must fall back to bounded templates when disabled, denied, rejected,
  or unnecessary.
- Template fallback for party chat must vary across multiple short patterns so
  the same role split does not produce obviously repeated lines every pull.
- Require structured output, validation, cooldowns, budgets, caching, and
  operator audit for every model-assisted path.
- Never let model output directly mutate authoritative world state.

### E. Operator controls

- Expose diagnostics for planner state, live runners, objectives, social
  overlays, and failures.
- Support rollout levers: pause provisioning, pause login, disable LLM overlays,
  and emergency logout-all.
- Preserve enough telemetry to debug suspicious loops, churn, or social
  incidents.

## Non-functional requirements

### Safety

- Keep all authoritative gameplay in the shared sim and real server command
  path.
- Respect existing moderation, rate limits, and social blocks.
- Keep anti-bot integration pluggable for future production policy work.

### Performance

- Minimize unnecessary bot churn through cluster sharing and online-bot reuse.
- Keep LLM usage sparse and rate-limited.
- Avoid hot-path per-tick allocations in the runtime brain and group layers.

### Maintainability

- Prefer focused modules and data registries.
- Keep fork-local behavior out of giant mixed-concern branches when a named seam
  or helper can host it.
- Ship each behavior slice with targeted tests and packet updates.

## Acceptance signals

- A human standing in a starter or mid-game zone consistently sees a believable
  local population that changes over time.
- Bots keep progressing even when the observing human stops moving.
- Local depletion naturally refills through logins or handoffs without obvious
  spawning tricks.
- Grouped bots can enter and complete dungeon content using only real commands.
- Player-led groups can include assigned bots without the bots stealing
  leadership decisions or breaking follow.
- Grouped parties finish obvious prep work, heal up, buff up, and then collapse
  onto one combat target instead of scattering opening actions.
- Ambient-bot-led parties visibly sound coordinated: the leader briefly calls
  assignments and focus in party chat, followers confirm their role once, and
  the later tactical behavior matches what the party just said it would do.
- Friend, whisper, and chat surfaces remain bounded, moderated, and operator
  visible.
- Real-player friend adds against nearby ambient bots settle into a mutual
  friend state without surfacing a fake pending-request UX.

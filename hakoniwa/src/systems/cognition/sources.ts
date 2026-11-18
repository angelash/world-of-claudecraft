// Evidence and exposure sources that were missing (PK-M1-19; reputation_and_cognition.md
// 3.1 "权威背书", 3.4, 3.6, 4.4, 6.1; builtin_ai.md 5.6, 6.4 rows 40 and 41):
//
// - authority: an authority (guild master, official, priest, an officer) who accepts the
//   player's deeds as real vouches for them when passing the news on; the guild's own
//   promotion of the player is the guild's acknowledgement (a practical rank counts less).
//   Weight 2 to 4 by the authority (data/cognition/sources.json), more for a devout
//   listener hearing a priest.
// - identity exposure from talk and trials: a story flag that exposes the player in front
//   of a crowd (the holy-light appraisal at the trial); a self-claim of coming from beyond
//   the garden that a listener actually credits (K2 and above, the gatefolk); a person who
//   holds a hot rumor about the player and now meets them face to face (the match).
//
// The close repeat (`repeat_close`) is the witnesses' own (./witness.ts).

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { remember } from '../npc/brain/memory_rules';
import { type IdentityKind, react } from '../npc/brain/reactions';
import { personaById } from '../npc/personas';
import type { PersonaCard } from '../npc/types';
import { playerEntity } from '../world';
import { observe } from './belief';
import { isAccepted } from './params';

export interface AuthorityRank {
  tags?: string[];
  roles?: string[];
  weight: number;
}

export interface CognitionSources {
  authority: {
    ranks: AuthorityRank[];
    devoutBonus: { tags: string[]; devotion: number; bonus: number };
    max: number;
    /** the guild's acknowledgement of a rank: regular and practical (实字 B, society.md 3.2) */
    guild: { rank: number; practical: number };
    /**
     * Explanations only the church's word reaches (3.4: sorcery falls to the church's counter
     * endorsement, a miracle is the church's to judge); tags of the church's authorities
     */
    church: { explanations: string[]; tags: string[] };
  };
  exposure: {
    /** a story flag turning true exposes the player where they stand */
    flags: { flag: string; kind: IdentityKind }[];
    /** who credits a self-claim of coming from beyond (6.4 row 41) */
    claims: { minTier: string; classes: string[] };
    /** rumor heat at which a holder matches the rumor to the player's face */
    matchHeat: number;
  };
}

declare module '../../core/contracts' {
  interface ContentMap {
    cognitionSources: CognitionSources;
  }
}

const TIERS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

/** The authority weight of a person's word (0: no authority). */
export function authorityWeight(
  sources: CognitionSources | undefined,
  teller: PersonaCard | undefined,
  listener: PersonaCard | undefined,
): number {
  if (!sources || !teller) return 0;
  const a = sources.authority;
  let w = 0;
  for (const r of a.ranks) {
    const hit =
      (r.tags ?? []).some((t) => teller.tags.includes(t)) ||
      (r.roles ?? []).some((x) => (teller.roles ?? []).includes(x as never));
    if (hit) w = Math.max(w, r.weight);
  }
  if (w === 0) return 0;
  const devout = (listener?.devotion ?? 0) >= a.devoutBonus.devotion;
  if (devout && a.devoutBonus.tags.some((t) => teller.tags.includes(t))) w += a.devoutBonus.bonus;
  return Math.min(a.max, w);
}

/**
 * The authority evidence a teller adds to news about `subject` (3.1, 4.4 "问权威"): an
 * authority who accepts the subject's deeds as real vouches for them; 0 otherwise.
 */
export function vouchWeight(
  ctx: SystemContext,
  tellerId: string,
  listenerId: string,
  subject: string,
): number {
  const b = ctx.world.slices.cognition.beliefs[tellerId]?.[subject];
  if (!b || !isAccepted(b.state)) return 0;
  const listened = ctx.world.slices.cognition.beliefs[listenerId]?.[subject];
  if (!churchMay(ctx, personaById(ctx.content, tellerId), listened?.explanation ?? null)) return 0;
  return authorityWeight(
    ctx.content.cognitionSources,
    personaById(ctx.content, tellerId),
    personaById(ctx.content, listenerId),
  );
}

/**
 * Whether an authority's word reaches the listener's explanation: what only the church
 * judges (sorcery, a miracle) yields to the church's authorities alone (3.4).
 */
export function churchMay(
  ctx: SystemContext,
  teller: PersonaCard | undefined,
  explanation: string | null,
): boolean {
  const c = ctx.content.cognitionSources?.authority.church;
  if (!c || !explanation || !c.explanations.includes(explanation)) return true;
  return !!teller && c.tags.some((t) => teller.tags.includes(t));
}

/**
 * The guild acknowledged the player's rank (registration or promotion, 3.1 "公会的承认"):
 * the named people of the player's map who already hold a view of the player receive it as
 * authority evidence (a practical rank counts less). One record per rank and person.
 */
export function guildEndorsement(ctx: SystemContext, rank: string, practical: boolean): number {
  const src = ctx.content.cognitionSources;
  const p = playerEntity(ctx.world);
  if (!src || !p) return 0;
  const weight = practical ? src.authority.guild.practical : src.authority.guild.rank;
  const slice = ctx.world.slices.cognition;
  let n = 0;
  for (const id of Object.keys(slice.beliefs).sort()) {
    const st = ctx.world.slices.npc.npcs[id];
    if (!st || st.resident || st.gone || st.mapId !== p.mapId) continue;
    const held = slice.beliefs[id]?.player;
    if (!held) continue;
    // the guild is no church: it does not reach sorcery or a miracle (3.4)
    if (!churchMay(ctx, undefined, held.explanation)) continue;
    observe(ctx, id, 'player', {
      key: `guild:${rank}:${ctx.tick}`,
      ind: `auth:guild:${rank}`,
      apparent: 0,
      kinds: [{ kind: 'authority', weight }],
      direct: false,
      what: tr('sys.cognition.evidence.guild_rank', { rank: tr(`sys.guild.rank.${rank}`) }),
    });
    n++;
  }
  return n;
}

function exposeAt(ctx: SystemContext, kind: IdentityKind, mapId: string, x: number, y: number) {
  ctx.emit('identity.exposed', { kind, mapId, x, y });
}

/**
 * An exposure only one person takes in (a face-to-face match, a claim they credit): they
 * react by the reaction table and remember it; bystanders hear nothing of it.
 */
function exposeTo(
  ctx: SystemContext,
  npcRef: string,
  kind: IdentityKind,
  opts: { stance?: boolean } = {},
): void {
  const b = ctx.world.slices.cognition.beliefs[npcRef]?.player;
  // without the stance the reaction rows read it as a recognition (the challenge of a
  // lawman, else an onlooker), never as a stance row such as worship, which warms rumors
  const state = opts.stance === false ? undefined : b?.state;
  react(
    ctx,
    npcRef,
    { kind, subject: 'player', over: 0, explanation: b?.explanation ?? null, state },
    true,
  );
  remember(
    ctx,
    npcRef,
    'feat_seen',
    { what: tr(`sys.npc.exposure.${kind}`) },
    { about: 'player', salience: 0.5 },
  );
}

/** Note that a person took in an exposure (once per person and source). */
function firstTime(ctx: SystemContext, npcRef: string, key: string): boolean {
  const slice = ctx.world.slices.cognition;
  const done = slice.matched?.[npcRef] ?? [];
  if (done.includes(key)) return false;
  slice.matched ??= {};
  slice.matched[npcRef] = [...done, key].slice(-16);
  return true;
}

/** A story flag turned true: the exposure it stands for, where the player stands (trials). */
export function exposureFromFlag(ctx: SystemContext, key: string, value: unknown): boolean {
  const rows = ctx.content.cognitionSources?.exposure.flags ?? [];
  const row = rows.find((r) => r.flag === key);
  const p = playerEntity(ctx.world);
  if (!row || !value || !p) return false;
  exposeAt(ctx, row.kind, p.mapId, p.x, p.y);
  return true;
}

/** Whether a listener credits the player's claim of coming from beyond the garden (6.4 row 41). */
export function creditsGuestClaim(ctx: SystemContext, listener: string): boolean {
  const c = ctx.content.cognitionSources?.exposure.claims;
  const p = personaById(ctx.content, listener);
  if (!c || !p) return false;
  return TIERS.indexOf(p.knowledge) >= TIERS.indexOf(c.minTier) || c.classes.includes(p.class);
}

/**
 * The player told someone they come from beyond the garden: words alone never confirm it
 * (ledger rule 6), but a listener who credits it exposes the player as a guest where the
 * talk is (5.6 identity_guest "自曝被采信"). Returns whether it exposed.
 */
export function guestClaim(ctx: SystemContext, listener: string): boolean {
  if (!ctx.world.slices.cognition || !creditsGuestClaim(ctx, listener)) return false;
  if (!firstTime(ctx, listener, 'guest')) return false;
  exposeTo(ctx, listener, 'identity_guest');
  return true;
}

/**
 * Face to face with a person who holds a hot rumor about the player (5.6 identity_matched
 * "传闻……与眼前的玩家对上号"): the first talk after hearing it matches the rumor to the face.
 * Only someone who knows the player by hearsay alone matches: whoever saw the player's deeds
 * already knows the face (and a worshipper's reaction would warm every rumor they hold, so
 * the old news would crowd the new out of town talk and the road). Each rumor matches once
 * per person.
 */
export function matchOnTalk(ctx: SystemContext, npcRef: string): boolean {
  const src = ctx.content.cognitionSources;
  const slice = ctx.world.slices.cognition;
  if (!src || !slice) return false;
  const known = slice.beliefs[npcRef]?.player?.evidence ?? [];
  if (known.some((x) => x.kind === 'seen' || x.kind === 'seen_close')) return false;
  const done = new Set(slice.matched?.[npcRef] ?? []);
  const hot = (slice.holdings[npcRef] ?? []).find((h) => {
    const r = slice.rumors[h.rumor];
    return (
      !!r &&
      h.believed &&
      h.from !== 'seen' &&
      (r.subject === 'player' || h.v.subject === 'player') &&
      r.heat >= src.exposure.matchHeat &&
      !done.has(r.id)
    );
  });
  if (!hot || !firstTime(ctx, npcRef, hot.rumor)) return false;
  exposeTo(ctx, npcRef, 'identity_matched', { stance: false });
  return true;
}

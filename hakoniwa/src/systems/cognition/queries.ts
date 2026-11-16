// Read-only views: belief impressions, the player's rumor book, circulating rumors,
// regional and faction reputation (reputation_and_cognition.md 5 and 11). Everything is
// banded text (TextRefs or content strings); raw numbers are only for the editor workbench.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import type { World } from '../../core/world';
import { personaById, personaIndex } from '../npc/personas';
import { relationOf } from '../npc/relations';
import { mapById } from '../world';
import {
  explanationDef,
  isAccepted,
  stateName,
  subjectName,
  tierLabel,
  tierOfApparent,
} from './params';
import { HEAT_FLOOR } from './rumor';
import { rumorText } from './rumor_text';
import type {
  AppraisalResult,
  BeliefProfile,
  BeliefState,
  ExplainCategory,
  RumorVersion,
} from './types';

export interface BeliefView {
  observerId: string;
  subjectId: string;
  state: BeliefState;
  stateName: TextParam;
  publicState: BeliefState;
  publicStateName: TextParam;
  /** what this person takes the subject for */
  identity: TextParam;
  explanation: string | null;
  category: ExplainCategory | null;
  lastFeat: { kind: string; explanation: TextParam } | null;
  /** estimated strength as a tier name */
  estimate: TextParam;
  credence: TextParam;
  log: TextParam[];
}

const CATEGORY_NAMES: Record<ExplainCategory, () => KeyText> = {
  luck: () => tr('sys.cognition.category.luck'),
  cheat: () => tr('sys.cognition.category.cheat'),
  gadget: () => tr('sys.cognition.category.gadget'),
  miracle: () => tr('sys.cognition.category.miracle'),
  monster: () => tr('sys.cognition.category.monster'),
  conspiracy: () => tr('sys.cognition.category.conspiracy'),
  real: () => tr('sys.cognition.category.real'),
};

export function credBand(c: number): KeyText {
  if (c >= 0.8) return tr('sys.cognition.cred.trusted');
  if (c >= 0.5) return tr('sys.cognition.cred.unsure');
  return tr('sys.cognition.cred.doubtful');
}

/** Grouping and tie-break key of a text value (content strings as written, TextRefs as JSON). */
function textKey(v: TextParam): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function beliefRaw(
  world: World,
  observer: string,
  subject = 'player',
): BeliefProfile | undefined {
  return world.slices.cognition.beliefs[observer]?.[subject];
}

export function beliefView(
  world: World,
  content: ContentMap,
  observer: string,
  subject = 'player',
): BeliefView | null {
  const b = beliefRaw(world, observer, subject);
  if (!b) return null;
  const def = b.explanation ? explanationDef(content, b.explanation) : undefined;
  const lastExpl = b.lastFeat?.explanation;
  const lastDef = lastExpl && lastExpl !== 'real' ? explanationDef(content, lastExpl) : undefined;
  return {
    observerId: observer,
    subjectId: subject,
    state: b.state,
    stateName: stateName(b.state),
    publicState: b.publicState,
    publicStateName: stateName(b.publicState),
    identity: b.identity,
    explanation: def?.label ?? null,
    category: isAccepted(b.state) ? 'real' : (def?.category ?? null),
    lastFeat: b.lastFeat
      ? {
          kind: b.lastFeat.kind,
          explanation:
            lastExpl === 'real'
              ? CATEGORY_NAMES.real()
              : lastDef
                ? CATEGORY_NAMES[lastDef.category]()
                : tr('sys.cognition.category.unclear'),
        }
      : null,
    estimate: tierLabel(tierOfApparent(b.est)),
    credence: credBand(b.credence),
    log: [...b.log],
  };
}

export interface RumorBookEntry {
  rumorId: string;
  text: TextParam;
  fromId: string;
  fromName: TextParam;
  credibility: TextParam;
  tick: number;
  aboutPlayer: boolean;
}

/** Rumors the player has heard (the rumor book). */
export function rumorBook(world: World, content: ContentMap): RumorBookEntry[] {
  const slice = world.slices.cognition;
  return (slice.holdings.player ?? []).map((h) => {
    const r = slice.rumors[h.rumor];
    return {
      rumorId: h.rumor,
      text: rumorText(content, h.v, r?.topic ?? ''),
      fromId: h.from,
      fromName: personaById(content, h.from)?.name ?? tr('sys.cognition.teller.neighbors'),
      credibility: credBand(h.cred),
      tick: h.tick,
      aboutPlayer: r?.subject === 'player',
    };
  });
}

export interface CirculatingRumor {
  id: string;
  topic: string;
  subject: string;
  heat: number;
  tellings: number;
  versions: { text: TextParam; holders: number; distortion: number; v: RumorVersion }[];
}

/** Rumors in circulation (workbench, and "rumors about the player" with subject 'player'). */
export function circulatingRumors(
  world: World,
  content: ContentMap,
  subject?: string,
): CirculatingRumor[] {
  const slice = world.slices.cognition;
  const out: CirculatingRumor[] = [];
  for (const r of Object.values(slice.rumors).sort(
    (a, b) => a.tick - b.tick || a.id.localeCompare(b.id),
  )) {
    if (subject && r.subject !== subject) continue;
    const byText = new Map<
      string,
      { text: TextParam; holders: number; distortion: number; v: RumorVersion }
    >();
    for (const holder of Object.keys(slice.holdings).sort()) {
      if (holder === 'player') continue;
      for (const h of slice.holdings[holder] ?? []) {
        if (h.rumor !== r.id) continue;
        const text = rumorText(content, h.v, r.topic);
        const key = textKey(text);
        const cur = byText.get(key);
        if (cur) cur.holders++;
        else byText.set(key, { text, holders: 1, distortion: h.v.distortion, v: h.v });
      }
    }
    out.push({
      id: r.id,
      topic: r.topic,
      subject: r.subject,
      heat: r.heat,
      tellings: r.tellings,
      versions: [...byText.values()].sort((a, b) => b.holders - a.holders),
    });
  }
  return out;
}

export interface Reputation {
  id: string;
  name: TextParam;
  fame: number;
  fameBand: TextParam;
  opinion: number;
  opinionBand: TextParam;
  estimate: TextParam;
  label: TextParam;
  mainstream: TextParam[];
}

function fameBand(f: number): KeyText {
  if (f < 0.1) return tr('sys.cognition.fame.unknown');
  if (f < 0.35) return tr('sys.cognition.fame.heard_of');
  if (f < 0.7) return tr('sys.cognition.fame.known');
  return tr('sys.cognition.fame.famous');
}

function opinionBand(o: number): KeyText {
  if (o <= -40) return tr('sys.cognition.opinion.hate');
  if (o <= -10) return tr('sys.cognition.opinion.cold');
  if (o < 15) return tr('sys.cognition.opinion.neutral');
  if (o < 40) return tr('sys.cognition.opinion.friendly');
  return tr('sys.cognition.opinion.respect');
}

function aggregate(
  world: World,
  id: string,
  name: TextParam,
  members: string[],
  crowdShare: number,
): Reputation {
  const slice = world.slices.cognition;
  let aware = 0;
  let opinion = 0;
  const ests: number[] = [];
  const identities = new Map<string, { text: TextParam; n: number }>();
  for (const m of members) {
    const b = slice.beliefs[m]?.player;
    const heard = (slice.holdings[m] ?? []).some(
      (h) => slice.rumors[h.rumor]?.subject === 'player',
    );
    if ((!b || b.state === 'unaware') && !heard) continue;
    aware++;
    opinion += relationOf(world.slices.npc, m, 'player').like;
    if (b) {
      ests.push(b.est);
      const key = textKey(b.identity);
      const cur = identities.get(key);
      if (cur) cur.n++;
      else identities.set(key, { text: b.identity, n: 1 });
    }
  }
  const n = members.length || 1;
  const fame = Math.min(1, aware / n + crowdShare * 0.5);
  ests.sort((a, b) => a - b);
  const median = ests.length ? (ests[Math.floor(ests.length / 2)] as number) : 3;
  const label =
    [...identities.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0]?.[1]
      .text ?? tr('sys.cognition.reputation.unknown');
  return {
    id,
    name,
    fame: Math.round(fame * 100) / 100,
    fameBand: fameBand(fame),
    opinion: aware ? Math.round(opinion / aware) : 0,
    opinionBand: opinionBand(aware ? opinion / aware : 0),
    estimate: tierLabel(tierOfApparent(median)),
    label,
    mainstream: [],
  };
}

const FACTION_NAMES: Record<string, () => KeyText> = {
  guild: () => tr('sys.cognition.faction.guild'),
  church: () => tr('sys.cognition.faction.church'),
  inquisition: () => tr('sys.cognition.faction.inquisition'),
  mercator: () => tr('sys.cognition.faction.mercator'),
  magistrate: () => tr('sys.cognition.faction.magistrate'),
  town_guard: () => tr('sys.cognition.faction.town_guard'),
  east_slope: () => tr('sys.cognition.faction.east_slope'),
  lumberyard: () => tr('sys.cognition.faction.lumberyard'),
  count: () => tr('sys.cognition.faction.count'),
  heroes: () => tr('sys.cognition.faction.heroes'),
  academy: () => tr('sys.cognition.faction.academy'),
  city_guard: () => tr('sys.cognition.faction.city_guard'),
};

/** Reputation of the player by region (map) and by faction. */
export function reputationOf(
  world: World,
  content: ContentMap,
): { regions: Reputation[]; factions: Reputation[] } {
  const slice = world.slices.cognition;
  const npcs = world.slices.npc.npcs;
  const byMap = new Map<string, string[]>();
  const byFaction = new Map<string, string[]>();
  for (const p of personaIndex(content).values()) {
    const st = npcs[p.id];
    if (!st || st.gone === 'dead') continue;
    byMap.set(p.map, [...(byMap.get(p.map) ?? []), p.id]);
    byFaction.set(p.faction, [...(byFaction.get(p.faction) ?? []), p.id]);
  }
  const regions: Reputation[] = [];
  for (const mapId of [...byMap.keys()].sort()) {
    const crowd = Object.entries(slice.crowd[mapId] ?? {}).filter(
      ([id]) => slice.rumors[id]?.subject === 'player',
    );
    const share = crowd.reduce((m, [, c]) => Math.max(m, c.share), 0);
    const rep = aggregate(
      world,
      mapId,
      mapById(content, mapId)?.name ?? mapId,
      byMap.get(mapId) ?? [],
      share,
    );
    // mainstream versions: the most held texts about the player on this map
    const counts = new Map<string, { text: TextParam; n: number }>();
    for (const m of byMap.get(mapId) ?? []) {
      for (const h of slice.holdings[m] ?? []) {
        const r = slice.rumors[h.rumor];
        if (r?.subject !== 'player' || r.heat < HEAT_FLOOR) continue;
        const t = rumorText(content, h.v, r.topic);
        const key = textKey(t);
        const cur = counts.get(key);
        if (cur) cur.n++;
        else counts.set(key, { text: t, n: 1 });
      }
    }
    rep.mainstream = [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([, c]) => c.text);
    regions.push(rep);
  }
  const factions: Reputation[] = [];
  const suspicion = Number(world.meta.flags.church_suspicion ?? 0) || 0;
  for (const f of [...byFaction.keys()].sort()) {
    const factionName = FACTION_NAMES[f];
    if (!factionName) continue;
    const members = byFaction.get(f) ?? [];
    const rep = aggregate(world, f, factionName(), members, 0);
    if (
      f === 'guild' &&
      members.some((m) => slice.beliefs[m]?.player?.evidence.some((e) => e.kind === 'appraisal'))
    )
      rep.label = tr('sys.cognition.reputation.crystal_glitch');
    if ((f === 'church' || f === 'inquisition') && suspicion >= 20)
      rep.label =
        suspicion >= 50
          ? tr('sys.cognition.reputation.heretic')
          : tr('sys.cognition.reputation.anomaly');
    factions.push(rep);
  }
  return { regions, factions };
}

export function appraisalLog(world: World): AppraisalResult[] {
  return [...world.slices.cognition.appraisals];
}

export function lastAppraisal(world: World): AppraisalResult | undefined {
  const list = world.slices.cognition.appraisals;
  return list[list.length - 1];
}

export { subjectName };

// Read-only views: belief impressions, the player's rumor book, circulating rumors,
// regional and faction reputation (reputation_and_cognition.md 5 and 11). Everything is
// banded text; raw numbers are only for the editor workbench.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { personaById, personaIndex } from '../npc/personas';
import { relationOf } from '../npc/relations';
import { mapById } from '../world';
import {
  explanationDef,
  isAccepted,
  STATE_NAMES,
  subjectName,
  TIER_LABELS,
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
  stateName: string;
  publicState: BeliefState;
  publicStateName: string;
  /** what this person takes the subject for */
  identity: string;
  explanation: string | null;
  category: ExplainCategory | null;
  lastFeat: { kind: string; explanation: string } | null;
  /** estimated strength as a tier name */
  estimate: string;
  credence: string;
  log: string[];
}

const CATEGORY_NAMES: Record<ExplainCategory, string> = {
  luck: '运气',
  cheat: '作弊',
  gadget: '魔道具',
  miracle: '神迹',
  monster: '魔物作祟',
  conspiracy: '阴谋',
  real: '真实',
};

export function credBand(c: number): string {
  if (c >= 0.8) return '可信';
  if (c >= 0.5) return '半信半疑';
  return '不太可信';
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
    stateName: STATE_NAMES[b.state] ?? b.state,
    publicState: b.publicState,
    publicStateName: STATE_NAMES[b.publicState] ?? b.publicState,
    identity: b.identity,
    explanation: def?.label ?? null,
    category: isAccepted(b.state) ? 'real' : (def?.category ?? null),
    lastFeat: b.lastFeat
      ? {
          kind: b.lastFeat.kind,
          explanation:
            lastExpl === 'real'
              ? CATEGORY_NAMES.real
              : lastDef
                ? CATEGORY_NAMES[lastDef.category]
                : '还说不好',
        }
      : null,
    estimate: TIER_LABELS[tierOfApparent(b.est)] ?? '',
    credence: credBand(b.credence),
    log: [...b.log],
  };
}

export interface RumorBookEntry {
  rumorId: string;
  text: string;
  fromId: string;
  fromName: string;
  credibility: string;
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
      fromName: personaById(content, h.from)?.name ?? '街坊们',
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
  versions: { text: string; holders: number; distortion: number; v: RumorVersion }[];
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
      { text: string; holders: number; distortion: number; v: RumorVersion }
    >();
    for (const holder of Object.keys(slice.holdings).sort()) {
      if (holder === 'player') continue;
      for (const h of slice.holdings[holder] ?? []) {
        if (h.rumor !== r.id) continue;
        const text = rumorText(content, h.v, r.topic);
        const cur = byText.get(text);
        if (cur) cur.holders++;
        else byText.set(text, { text, holders: 1, distortion: h.v.distortion, v: h.v });
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
  name: string;
  fame: number;
  fameBand: string;
  opinion: number;
  opinionBand: string;
  estimate: string;
  label: string;
  mainstream: string[];
}

function fameBand(f: number): string {
  if (f < 0.1) return '无人知晓';
  if (f < 0.35) return '有人听说';
  if (f < 0.7) return '小有名气';
  return '家喻户晓';
}

function opinionBand(o: number): string {
  if (o <= -40) return '厌恶';
  if (o <= -10) return '冷淡';
  if (o < 15) return '一般';
  if (o < 40) return '友善';
  return '敬重';
}

function aggregate(
  world: World,
  id: string,
  name: string,
  members: string[],
  crowdShare: number,
): Reputation {
  const slice = world.slices.cognition;
  let aware = 0;
  let opinion = 0;
  const ests: number[] = [];
  const identities = new Map<string, number>();
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
      identities.set(b.identity, (identities.get(b.identity) ?? 0) + 1);
    }
  }
  const n = members.length || 1;
  const fame = Math.min(1, aware / n + crowdShare * 0.5);
  ests.sort((a, b) => a - b);
  const median = ests.length ? (ests[Math.floor(ests.length / 2)] as number) : 3;
  const label =
    [...identities.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    '没人认识的外乡人';
  return {
    id,
    name,
    fame: Math.round(fame * 100) / 100,
    fameBand: fameBand(fame),
    opinion: aware ? Math.round(opinion / aware) : 0,
    opinionBand: opinionBand(aware ? opinion / aware : 0),
    estimate: TIER_LABELS[tierOfApparent(median)] ?? '',
    label,
    mainstream: [],
  };
}

const FACTION_NAMES: Record<string, string> = {
  guild: '冒险者公会',
  church: '圣教会',
  inquisition: '异端审判庭',
  mercator: '梅尔卡托商会联合',
  magistrate: '代官府',
  town_guard: '镇卫队',
  east_slope: '东坡猎户',
  lumberyard: '伐木场',
  count: '伯爵府',
  heroes: '勇者团',
  academy: '学院',
  city_guard: '城防军',
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
    const counts = new Map<string, number>();
    for (const m of byMap.get(mapId) ?? []) {
      for (const h of slice.holdings[m] ?? []) {
        const r = slice.rumors[h.rumor];
        if (r?.subject !== 'player' || r.heat < HEAT_FLOOR) continue;
        const t = rumorText(content, h.v, r.topic);
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    rep.mainstream = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([t]) => t);
    regions.push(rep);
  }
  const factions: Reputation[] = [];
  const suspicion = Number(world.meta.flags.church_suspicion ?? 0) || 0;
  for (const f of [...byFaction.keys()].sort()) {
    if (!FACTION_NAMES[f]) continue;
    const members = byFaction.get(f) ?? [];
    const rep = aggregate(world, f, FACTION_NAMES[f] as string, members, 0);
    if (
      f === 'guild' &&
      members.some((m) => slice.beliefs[m]?.player?.evidence.some((e) => e.kind === 'appraisal'))
    )
      rep.label = '水晶故障的那个人';
    if ((f === 'church' || f === 'inquisition') && suspicion >= 20)
      rep.label = suspicion >= 50 ? '异端嫌疑人' : '规格外者';
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

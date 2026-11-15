// Parameter access for cognition: social-class parameters, explanation definitions,
// the feat tier to apparent level mapping, ceilings, priors and thresholds
// (reputation_and_cognition.md 3.2 to 3.5, society.md 8.2 to 8.7). Values are "待调".

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { personaById } from '../npc/personas';
import type { PersonaCard, RelationDims, SocialClass } from '../npc/types';
import { getEntity } from '../world';
import type { ClassParams, ExplanationDef, ExplanationId } from './types';

/** Apparent level of a feat by its tier magnitude 0..7 (anchors of 3.2). */
export const APPARENT_BY_TIER = [5, 15, 25, 40, 55, 60, 70, 80];

export function apparentOfTier(tier: number): number {
  const t = Math.max(0, Math.min(7, Math.round(tier)));
  return APPARENT_BY_TIER[t] as number;
}

/** Witness range in tiles and clarity bands (close 1.0, mid 0.75, far 0.5). */
export const VIEW_RADIUS = 10;
export function clarityAt(d: number): number {
  if (d <= 4) return 1;
  if (d <= 7) return 0.75;
  return 0.5;
}

/** The player's identity prior: guild card "F, Lv1, no class" (society.md 8.1). */
export const PLAYER_PRIOR = 3;

const FALLBACK_CLASS: ClassParams = { id: 'peasant', ceiling: 20, base: 8, order: ['luck'] };

const classCache = new WeakMap<object, Map<string, ClassParams>>();
const explCache = new WeakMap<object, Map<string, ExplanationDef>>();

export function classParams(
  content: Pick<ContentMap, 'cognitionClasses'>,
  id: SocialClass,
): ClassParams {
  let idx = classCache.get(content);
  if (!idx) {
    idx = new Map((content.cognitionClasses ?? []).map((c) => [c.id, c]));
    classCache.set(content, idx);
  }
  return idx.get(id) ?? FALLBACK_CLASS;
}

export function explanationDef(
  content: Pick<ContentMap, 'cognitionExplanations'>,
  id: ExplanationId,
): ExplanationDef | undefined {
  let idx = explCache.get(content);
  if (!idx) {
    idx = new Map((content.cognitionExplanations ?? []).map((e) => [e.id, e]));
    explCache.set(content, idx);
  }
  return idx.get(id);
}

export function ceilingOf(content: ContentMap, p: PersonaCard): number {
  return p.ceiling ?? classParams(content, p.class).ceiling;
}

/** Personality coefficient of the threshold (curious 0.8, normal 1, stubborn 1.4). */
export function personalityFactor(p: PersonaCard): number {
  if (p.personality === 'curious') return 0.8;
  if (p.personality === 'stubborn') return 1.4;
  return 1;
}

/** Stance coefficient from the relation (friendly 0.8, neutral 1, hostile 1.3). */
export function stanceFactor(r: RelationDims | undefined): number {
  if (!r) return 1;
  if (r.like >= 30) return 0.8;
  if (r.like <= -30) return 1.3;
  return 1;
}

/** threshold = base x personality x (1 + max(0, overreach) / 20) x stance (3.5). */
export function thresholdFor(
  content: ContentMap,
  p: PersonaCard,
  over: number,
  rel: RelationDims | undefined,
): number {
  const cls = classParams(content, p.class);
  return cls.base * personalityFactor(p) * (1 + Math.max(0, over) / 20) * stanceFactor(rel);
}

/** What an observer initially assumes about a subject's strength. */
export function priorOf(world: World, content: ContentMap, subject: string): number {
  if (subject === 'player') return PLAYER_PRIOR;
  const p = personaById(content, subject);
  if (p) return p.concealed ? 5 : p.level;
  const e = getEntity(world, subject);
  const tag = e?.tags.find((t) => t.startsWith('lvl:'));
  return tag ? Number(tag.slice(4)) || 5 : 5;
}

/** Subject key of an acting entity: 'player', a persona id or a companion ref. */
export function subjectOfEntity(world: World, entityId: string): string | null {
  const e = getEntity(world, entityId);
  if (!e) return null;
  if (e.kind === 'player') return 'player';
  if ((e.kind === 'npc' || e.kind === 'companion') && e.ref) return e.ref;
  return null;
}

/** Display name of a rumor or belief subject as townsfolk would say it. */
export function subjectName(content: ContentMap, subject: string): string {
  if (subject === 'player') return '那个新来的 F 级';
  if (subject === 'stranger') return '某个怪人';
  if (subject === 'lucky_newbie') return '一个运气好的新人';
  if (subject === 'heroes') return '勇者团';
  return personaById(content, subject)?.name ?? '某个人';
}

export const STATE_NAMES: Record<string, string> = {
  unaware: '无视',
  doubt: '怀疑',
  explaining: '解释化',
  wavering: '动摇',
  accepted: '接受',
  worship: '崇拜',
  hostile: '敌视',
  exploit: '利用',
  depend: '依赖',
};

/** Whether a state counts as having accepted the truth. */
export function isAccepted(state: string): boolean {
  return (
    state === 'accepted' ||
    state === 'worship' ||
    state === 'hostile' ||
    state === 'exploit' ||
    state === 'depend'
  );
}

/** Rank of a state for regression and public-pressure comparisons. */
export function stateRank(state: string): number {
  if (isAccepted(state)) return 4;
  return { unaware: 0, doubt: 1, explaining: 2, wavering: 3 }[state] ?? 0;
}

export const TIER_LABELS = ['凡阶·初', '凡阶·熟', '精英阶', '英雄阶', '传说阶', '神话阶', '超越'];

export function tierOfApparent(level: number): number {
  if (level <= 9) return 0;
  if (level <= 19) return 1;
  if (level <= 34) return 2;
  if (level <= 49) return 3;
  if (level <= 59) return 4;
  if (level <= 60) return 5;
  return 6;
}

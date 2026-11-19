// Loading line packs and resolving the fallback chain (builtin_ai.md 7.1 and 7.3): for a
// speaker and a slot, the first source with an available line wins, in order: this act's
// override, this pack's own slot, progressively shorter slot names, the role layer, the
// resident template layer, the social class layer, and finally ln_common. Pure: no RNG, no
// clock (selection with weighting lives in ./select.ts).

import { CONTENT_PREFIX, contentKeySegment, contentTableKey } from '../../../core/content_key';
import type { ContentMap } from '../../../core/contracts';
import { defaultRegistry } from '../../../core/registry';
import type { Line, LineList, LinePack, VersionedLines } from './types';
import { isLine, isVersioned } from './types';

export const COMMON_PACK_ID = 'ln_common';
export const PARTY_PACK_ID = 'ln_party';

export const rolePackId = (role: string): string => `ln_role_${role}`;
export const classPackId = (cls: string): string => `ln_class_${cls}`;
export const residentPackId = (template: string): string =>
  `ln_tpl_${template.startsWith('tpl_') ? template.slice(4) : template}`;
export const npcPackId = (npcId: string): string => `ln_${npcId}`;

const index = new WeakMap<object, Map<string, LinePack>>();

function packIndex(content: Pick<ContentMap, 'linePacks'>): Map<string, LinePack> {
  let idx = index.get(content);
  if (!idx) {
    idx = new Map((content.linePacks ?? []).map((p) => [p.id, p]));
    index.set(content, idx);
  }
  return idx;
}

export function packById(content: Pick<ContentMap, 'linePacks'>, id: string): LinePack | undefined {
  return packIndex(content).get(id);
}

/** Every progressively shorter slot name of `slot`, longest first ('a.b.c', 'a.b', 'a'). */
export function slotChain(slot: string): string[] {
  const parts = slot.split('.');
  const out: string[] = [];
  for (let n = parts.length; n > 0; n--) out.push(parts.slice(0, n).join('.'));
  return out;
}

/** How a topic picks its version when the exact one is missing (builtin_ai 7.3). */
export type VersionBy = 'knowledge' | 'cognition' | 'act' | 'exact';

const KNOWLEDGE_ORDER = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];
/** The act flag's values in story order (the variable registry's enum). */
function actOrder(): readonly string[] {
  return defaultRegistry().resolve('act')?.def.values ?? [];
}
/** The cognition states in their order along the state machine (reputation_and_cognition 3). */
const COGNITION_ORDER = [
  'unaware',
  'doubt',
  'explaining',
  'wavering',
  'accepted',
  'worship',
  'hostile',
  'exploit',
  'depend',
];
/** The four forks after acceptance fall back to accepted, then down the line. */
const FORKS = new Set(['worship', 'hostile', 'exploit', 'depend']);

/**
 * The version keys to try for `version`, nearest first (builtin_ai 7.3): knowledge takes
 * the highest tier not above the speaker's; act takes the current act or the nearest
 * earlier one; cognition takes the state, then its nearest neighbours (a fork goes back to
 * accepted, then wavering and down; an unforked state tries the earlier state first). The
 * misdirection version `mis` is never a fallback: only an exact ask reaches it.
 */
export function versionCandidates(version: string, by: VersionBy = 'exact'): string[] {
  if (version === 'mis' || by === 'exact') return [version];
  if (by === 'knowledge' || by === 'act') {
    const order = by === 'knowledge' ? KNOWLEDGE_ORDER : actOrder();
    const at = order.indexOf(version);
    return at < 0 ? [version] : order.slice(0, at + 1).reverse();
  }
  const at = COGNITION_ORDER.indexOf(version);
  if (at < 0) return [version];
  if (FORKS.has(version)) return [version, ...COGNITION_ORDER.slice(0, 5).reverse()];
  const out = [version];
  for (let d = 1; d < 5; d++) {
    if (at - d >= 0) out.push(COGNITION_ORDER[at - d] as string);
    if (at + d < 5) out.push(COGNITION_ORDER[at + d] as string);
  }
  return out;
}

/** One slot entry: a plain list, or the nearest available version's list. */
function pickVersion(
  entry: LineList | VersionedLines | undefined,
  version: string | undefined,
  by: VersionBy | undefined,
): { lines: LineList; version?: string } | undefined {
  if (entry === undefined) return undefined;
  if (!isVersioned(entry)) return { lines: entry };
  if (version === undefined) return undefined;
  for (const v of versionCandidates(version, by)) {
    const lines = entry[v];
    if (lines?.some(isLine)) return { lines, version: v };
  }
  return undefined;
}

export interface ResolveOptions {
  /** current act flag value, e.g. 'act2'; checked before the base slot in the same pack */
  act?: string;
  /** topic version key (K0..K5, a cognition state, an act, a trust band, a stance, mis) */
  version?: string;
  /** how a missing version falls back (the topic's versionBy); exact by default */
  versionBy?: VersionBy;
}

export interface ResolvedSlot {
  /** the pack the lines came from */
  packId: string;
  /** the exact slot name matched (may be shorter than requested, chain step 3) */
  slot: string;
  /** the act override the lines came from (absent for the base slots) */
  act?: string;
  /** the version list the lines came from (absent for a plain slot) */
  version?: string;
  lines: LineList;
}

/** Steps 1 to 3 of builtin_ai 7.3 within one pack: acts override, own slot, chain. */
export function ownSlotLines(
  pack: LinePack,
  slot: string,
  opts: ResolveOptions,
): ResolvedSlot | null {
  return ownSlotSources(pack, slot, opts)[0] ?? null;
}

/**
 * Every source of `slot` inside one pack, nearest first (builtin_ai 7.3 steps 1 to 3): the
 * act override over the shortened names, then the base slot over the shortened names. A
 * selector that finds every line of one source conditioned out moves to the next source of
 * the same pack before it leaves the pack ("第一个有可用句子的来源"): an act override made only
 * of first-meeting or conditioned lines must not hide the speaker's own base lines.
 */
export function ownSlotSources(pack: LinePack, slot: string, opts: ResolveOptions): ResolvedSlot[] {
  const chain = slotChain(slot);
  const out: ResolvedSlot[] = [];
  if (opts.act) {
    const over = pack.acts?.[opts.act];
    if (over) {
      for (const s of chain) {
        const hit = pickVersion(over[s], opts.version, opts.versionBy);
        if (hit?.lines.some(isLine)) {
          out.push({
            packId: pack.id,
            slot: s,
            act: opts.act,
            version: hit.version,
            lines: hit.lines,
          });
          break;
        }
      }
    }
  }
  for (const s of chain) {
    const hit = pickVersion(pack.slots[s], opts.version, opts.versionBy);
    if (hit?.lines.some(isLine)) {
      out.push({ packId: pack.id, slot: s, version: hit.version, lines: hit.lines });
      break;
    }
  }
  return out;
}

export interface FallbackLayers {
  /** functional role ids (content_bible.md 9.2), tried before the resident template */
  roles?: readonly string[];
  /** resident template id, with or without its tpl_ prefix (the pack is ln_tpl_<rest>) */
  template?: string;
  /** social class id */
  socialClass?: string;
  /** only the speaker's own pack: a scripted speaker in its scripted act (../scripted.ts) */
  ownOnly?: boolean;
}

/** The pack ids of the fallback chain for a speaker, in order (builtin_ai 7.3). */
export function chainPackIds(npcId: string, layers: FallbackLayers = {}): string[] {
  // a scripted speaker says only its own written lines (../scripted.ts)
  if (layers.ownOnly) return [npcPackId(npcId)];
  return [
    npcPackId(npcId),
    ...(layers.roles ?? []).map(rolePackId),
    ...(layers.template ? [residentPackId(layers.template)] : []),
    ...(layers.socialClass ? [classPackId(layers.socialClass)] : []),
    COMMON_PACK_ID,
  ];
}

/**
 * Every source of `slot` along the chain (builtin_ai 7.3), nearest first: the speaker's own
 * pack (acts override, own slot, shortened names), the role layer in the given order, the
 * resident template layer, the class layer, then ln_common. The selector walks these in
 * turn, so a level whose lines are all suppressed or conditioned out gives way to the next.
 */
export function slotSources(
  content: Pick<ContentMap, 'linePacks'>,
  npcId: string,
  slot: string,
  opts: ResolveOptions & FallbackLayers = {},
): ResolvedSlot[] {
  const out: ResolvedSlot[] = [];
  for (const id of chainPackIds(npcId, opts)) {
    const pack = packById(content, id);
    if (!pack) continue;
    out.push(...ownSlotSources(pack, slot, opts));
  }
  return out;
}

/**
 * The nearest source of `slot` for a speaker, or null when nothing in the whole chain has
 * a line (a slot that falls off the end: step 8 of builtin_ai 7.3, reported as a gap).
 */
export function resolveSlot(
  content: Pick<ContentMap, 'linePacks'>,
  npcId: string,
  slot: string,
  opts: ResolveOptions & FallbackLayers = {},
): ResolvedSlot | null {
  for (const id of chainPackIds(npcId, opts)) {
    const pack = packById(content, id);
    const hit = pack ? ownSlotLines(pack, slot, opts) : null;
    if (hit) return hit;
  }
  return null;
}

/** Every line of `slot` reachable for a speaker, without picking one (coverage reports). */
export function linesFor(
  content: Pick<ContentMap, 'linePacks'>,
  npcId: string,
  slot: string,
  opts: ResolveOptions & FallbackLayers = {},
): Line[] {
  return (resolveSlot(content, npcId, slot, opts)?.lines ?? []).filter(isLine);
}

/**
 * Content text key of one line (D-077, builtin_ai 7.1), the key the content extractor
 * (src/shared_ui/content_text.ts) gives it by walking the pack's JSON: the record is the
 * linePacks row of the pack, then `slots.<slot>` or `acts.<act>.<slot>` (the slot name is
 * one JSON key, so its dots fold to underscores in one segment), the version, the 0-based
 * line index, and `zh` for a line written as an object. tests/lines.test.ts pins every
 * key the shipped packs produce against the extractor.
 */
export function lineKey(
  packId: string,
  slot: string,
  index: number,
  opts: { act?: string; version?: string; entry?: boolean } = {},
): string {
  // each part is one JSON object key, folded as one segment (contentKeySegment folds the
  // dots inside a slot name to underscores, as the extractor's walk does); a line written
  // as an object keeps its text under zh
  const parts = opts.act ? ['acts', opts.act, slot] : ['slots', slot];
  if (opts.version !== undefined) parts.push(opts.version);
  parts.push(String(index));
  if (opts.entry) parts.push('zh');
  return `${CONTENT_PREFIX}${contentTableKey('linePacks')}.${contentKeySegment(packId)}.${parts
    .map(contentKeySegment)
    .join('.')}`;
}

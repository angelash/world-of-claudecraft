// The glossary of the help window (ux_and_onboarding.md 17.7): the rows of the 17.7 table
// that the prologue and act 1 unlock, each with its unlock condition and, where the reveal
// ledger renames it, its two stages (灰气 to 澱 once the player has heard the word from Yeyu,
// `term.dian_known`, D-030; mortals keep the old word). An entry stays out of the list until
// it unlocks. Unlocks read registered flags or a guidance step the player has seen (17.8: most
// "first time" moments are the client's own discoveries). Text keys `ui.glossary.<id>.name`
// and `.body`, plus `.name_dian` and `.body_dian` for the renamed rows (20.2, 20.4). Pure.

import type { FlagValue } from '../../core/contracts';
import { t } from '../../shared_ui/i18n';
import type { TutCondOp } from './steps';

export type GlossUnlock =
  | { kind: 'always' }
  | { kind: 'flag'; flag: string; op: TutCondOp; value?: FlagValue }
  | { kind: 'step'; step: string };

export interface GlossaryEntry {
  id: string;
  /** any one of these unlocks it */
  unlock: readonly GlossUnlock[];
  /** renamed once the player knows the word (`term.dian_known`) */
  dian?: boolean;
}

/** The registered flag that renames 灰气 to 澱 on the interface (D-030). */
export const DIAN_KNOWN = 'term.dian_known';

const flag = (f: string, op: TutCondOp = 'truthy', value?: FlagValue): GlossUnlock =>
  value === undefined ? { kind: 'flag', flag: f, op } : { kind: 'flag', flag: f, op, value };
const seenStep = (step: string): GlossUnlock => ({ kind: 'step', step });

/** The 17.7 rows of the prologue and act 1, in the table's order. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  { id: 'doors', unlock: [flag('door.awaken')] },
  { id: 'gate_rank', unlock: [flag('door_rank', 'gt', 0)] },
  { id: 'record', unlock: [flag('a1_guild_registered')] },
  { id: 'grey', unlock: [flag('a1_wake_ruins'), flag(DIAN_KNOWN)], dian: true },
  { id: 'crystal_trade', unlock: [flag('a1_dian_trade')] },
  { id: 'taint', unlock: [flag('player.taint', 'gt', 0)], dian: true },
  { id: 'door_cost', unlock: [flag('door_fatigue', 'gt', 0), seenStep('tut_any_gatecost')] },
  { id: 'party', unlock: [flag('door.pact')] },
  { id: 'pressure', unlock: [flag('a1_ash_met'), seenStep('tut_a1_pressure')] },
  { id: 'rumor', unlock: [seenStep('tut_a1_rumor')] },
  { id: 'commission', unlock: [flag('guild_rank'), seenStep('tut_a1_board')] },
  { id: 'goddess', unlock: [{ kind: 'always' }] },
  { id: 'door_woman', unlock: [flag('a1_dream_door_woman')] },
  { id: 'judgement', unlock: [{ kind: 'always' }] },
  { id: 'folk', unlock: [flag('a1_wake_ruins')] },
  { id: 'courtyard', unlock: [flag('feature.inner_court')] },
  { id: 'dungeon', unlock: [seenStep('tut_a1_dungeon')], dian: true },
  { id: 'evidence', unlock: [seenStep('tut_a1_evidence')] },
];

function holds(op: TutCondOp, v: FlagValue | undefined, value: FlagValue | undefined): boolean {
  if (op === 'truthy') return v !== undefined && v !== false && v !== 0 && v !== '';
  if (op === 'falsy') return v === undefined || v === false || v === 0 || v === '';
  if (op === 'eq') return v === value;
  if (op === 'ne') return v !== value;
  const a = Number(v);
  const b = Number(value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return op === 'gte' ? a >= b : op === 'gt' ? a > b : op === 'lte' ? a <= b : a < b;
}

export function glossaryUnlocked(
  entry: GlossaryEntry,
  flags: Readonly<Record<string, FlagValue>>,
  stepSeen: (id: string) => boolean,
): boolean {
  return entry.unlock.some((u) =>
    u.kind === 'always'
      ? true
      : u.kind === 'step'
        ? stepSeen(u.step)
        : holds(u.op, flags[u.flag], u.value),
  );
}

export interface GlossaryRow {
  id: string;
  name: string;
  body: string;
}

/** The unlocked entries with their text for the reveal stage the player is at. */
export function glossaryModel(
  flags: Readonly<Record<string, FlagValue>>,
  stepSeen: (id: string) => boolean,
  entries: readonly GlossaryEntry[] = GLOSSARY,
): GlossaryRow[] {
  const known = holds('truthy', flags[DIAN_KNOWN], undefined);
  return entries
    .filter((e) => glossaryUnlocked(e, flags, stepSeen))
    .map((e) => {
      const base = `ui.glossary.${e.id}`;
      const renamed = !!e.dian && known;
      return {
        id: e.id,
        name: t(renamed ? `${base}.name_dian` : `${base}.name`),
        body: t(renamed ? `${base}.body_dian` : `${base}.body`),
      };
    });
}

/** Every text key the glossary needs (the onboarding check holds the tables to it). */
export function glossaryKeys(entries: readonly GlossaryEntry[] = GLOSSARY): string[] {
  return entries.flatMap((e) => {
    const base = `ui.glossary.${e.id}`;
    const keys = [`${base}.name`, `${base}.body`];
    if (e.dian) keys.push(`${base}.name_dian`, `${base}.body_dian`);
    return keys;
  });
}

/** Every flag the glossary reads (the onboarding check holds them to the registry). */
export function glossaryFlags(entries: readonly GlossaryEntry[] = GLOSSARY): string[] {
  const out = new Set<string>([DIAN_KNOWN]);
  for (const e of entries) for (const u of e.unlock) if (u.kind === 'flag') out.add(u.flag);
  return [...out].sort();
}

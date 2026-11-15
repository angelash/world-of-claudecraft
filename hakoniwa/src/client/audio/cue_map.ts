// Cue map (audio_direction.md 7.16 and 10.1; release_engineering.md 9.4): kernel events and
// animation key frames to sound ids, read from data/audio/cues.json. The kernel never reads the
// table. A trigger is an event type plus flat fields the client derives from the event payload
// and the world (attack kind, weapon class, hit material, monster voice family, surface, ...);
// every cue whose conditions match fires, so a crit adds its layer on top of the hit.
//
// A cue names its sound one of three ways: a fixed id (`sound`), a pattern filled from trigger
// fields (`select`, e.g. sfx_hit_{damage}_{material}), or a lookup on one field (`pick`). The
// table declares each field's value domain, so validation expands every pattern and can check
// every reachable id against the prompt library.

export type CueValue = string | number | boolean;
export type CueBus = 'sfx' | 'ui' | 'music' | 'ambience';
export type CueGroup = 'combat' | 'world' | 'army' | 'divine' | 'cine';
export type CaptionLevel = 'important' | 'all';

export interface CueSelect {
  /** Sound id pattern with {placeholder} slots. */
  pattern: string;
  /** Placeholder to the trigger field that fills it. */
  vars: Record<string, string>;
  /** Sound when a field is missing. */
  fallback?: string;
}

export interface CuePick {
  field: string;
  map: Record<string, string>;
  default?: string;
}

export interface CueBoost {
  when: Record<string, CueValue | CueValue[]>;
  priority: number;
}

export interface Cue {
  id: string;
  /** Kernel event type (combat.damage), animation key frame (anim.footstep) or client trigger (ui.llm_waiting). */
  event: string;
  when?: Record<string, CueValue | CueValue[]>;
  unless?: Record<string, CueValue | CueValue[]>;
  sound?: string;
  select?: CueSelect;
  pick?: CuePick;
  bus: CueBus;
  group?: CueGroup;
  /** Voice priority 0 (never preempted) to 5 (ambient detail), audio_direction.md 8.3. */
  priority: number;
  /** Higher priority in some situations (the player's own hits are level 1). */
  boost?: CueBoost[];
  /** Caption text key audio.cap.<id>, or null for none. */
  caption?: string | null;
  captionLevel?: CaptionLevel;
  /** Start this many milliseconds before the key frame (swings, wind-ups). */
  syncOffsetMs?: number;
  /** A music-bus phrase that ducks the music (5.7). */
  stinger?: boolean;
  note?: string;
}

export interface CueTable {
  version: 1;
  /** Value domain of every trigger field a cue reads. */
  fields: Record<string, CueValue[]>;
  cues: Cue[];
}

export interface Trigger {
  event: string;
  fields: Record<string, CueValue | undefined>;
}

export interface CueHit {
  cue: string;
  sound: string;
  bus: CueBus;
  group: CueGroup | null;
  priority: number;
  caption: string | null;
  captionLevel: CaptionLevel | null;
  syncOffsetMs: number;
  stinger: boolean;
}

const BUSES: readonly CueBus[] = ['sfx', 'ui', 'music', 'ambience'];
const GROUPS: readonly CueGroup[] = ['combat', 'world', 'army', 'divine', 'cine'];
const SOUND_ID = /^(sfx|mus|amb)_[a-z0-9]+(_[a-z0-9]+)*$/;
const CAPTION = /^audio\.cap\.[a-z0-9_]+$/;

function matches(
  cond: Record<string, CueValue | CueValue[]> | undefined,
  fields: Trigger['fields'],
): boolean {
  if (!cond) return true;
  for (const [k, want] of Object.entries(cond)) {
    const v = fields[k];
    if (v === undefined) return false;
    if (Array.isArray(want) ? !want.includes(v) : want !== v) return false;
  }
  return true;
}

function anyMatch(
  cond: Record<string, CueValue | CueValue[]> | undefined,
  fields: Trigger['fields'],
): boolean {
  return !!cond && matches(cond, fields);
}

function fillPattern(
  pattern: string,
  vars: Record<string, string>,
  fields: Trigger['fields'],
): string | null {
  let missing = false;
  const out = pattern.replace(/\{([a-zA-Z0-9]+)\}/g, (_m, name: string) => {
    const field = vars[name];
    const v = field ? fields[field] : undefined;
    if (v === undefined) {
      missing = true;
      return '';
    }
    return String(v);
  });
  return missing ? null : out;
}

/** The sound a matching cue plays for a trigger, or null when it resolves to nothing. */
export function soundFor(cue: Cue, fields: Trigger['fields']): string | null {
  if (cue.sound) return cue.sound;
  if (cue.select)
    return fillPattern(cue.select.pattern, cue.select.vars, fields) ?? cue.select.fallback ?? null;
  if (cue.pick) {
    const v = fields[cue.pick.field];
    return (v !== undefined ? cue.pick.map[String(v)] : undefined) ?? cue.pick.default ?? null;
  }
  return null;
}

/** Every cue that fires for a trigger, in table order. */
export function resolveCues(table: CueTable, trigger: Trigger): CueHit[] {
  const out: CueHit[] = [];
  for (const cue of table.cues) {
    if (cue.event !== trigger.event) continue;
    if (!matches(cue.when, trigger.fields)) continue;
    if (anyMatch(cue.unless, trigger.fields)) continue;
    const sound = soundFor(cue, trigger.fields);
    if (!sound) continue;
    let priority = cue.priority;
    for (const b of cue.boost ?? [])
      if (matches(b.when, trigger.fields)) priority = Math.min(priority, b.priority);
    out.push({
      cue: cue.id,
      sound,
      bus: cue.bus,
      group: cue.group ?? null,
      priority,
      caption: cue.caption ?? null,
      captionLevel: cue.caption ? (cue.captionLevel ?? 'all') : null,
      syncOffsetMs: cue.syncOffsetMs ?? 0,
      stinger: cue.stinger ?? false,
    });
  }
  return out;
}

/** Every sound id a cue can play, expanding patterns over the declared field domains. */
export function soundsOf(cue: Cue, fields: CueTable['fields']): string[] {
  if (cue.sound) return [cue.sound];
  if (cue.pick)
    return [
      ...new Set([...Object.values(cue.pick.map), ...(cue.pick.default ? [cue.pick.default] : [])]),
    ];
  if (!cue.select) return [];
  let combos: Record<string, CueValue>[] = [{}];
  for (const field of Object.values(cue.select.vars)) {
    const domain = fields[field] ?? [];
    combos = combos.flatMap((c) => domain.map((v) => ({ ...c, [field]: v })));
  }
  const ids = combos
    .map((c) => fillPattern(cue.select!.pattern, cue.select!.vars, c))
    .filter((s): s is string => !!s);
  if (cue.select.fallback) ids.push(cue.select.fallback);
  return [...new Set(ids)];
}

/** Structural problems of a cue table; with `known`, also every reachable sound id that does not exist. */
export function validateCueTable(table: unknown, known?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const t = table as Partial<CueTable>;
  if (!t || typeof t !== 'object') return ['cue table must be an object'];
  if (t.version !== 1) out.push('version must be 1');
  const fields = t.fields ?? {};
  if (typeof fields !== 'object') out.push('fields must map field names to value lists');
  for (const [k, v] of Object.entries(fields))
    if (!Array.isArray(v) || v.length === 0) out.push(`field ${k}: needs a non-empty value list`);
  if (!Array.isArray(t.cues)) return [...out, 'cues must be a list'];
  const seen = new Set<string>();
  const checkCond = (
    where: string,
    cond: Record<string, CueValue | CueValue[]> | undefined,
  ): void => {
    for (const [k, v] of Object.entries(cond ?? {})) {
      const domain = fields[k];
      if (!domain) {
        out.push(`${where}: field ${k} is not declared in fields`);
        continue;
      }
      for (const x of Array.isArray(v) ? v : [v])
        if (!domain.includes(x)) out.push(`${where}: ${k}=${String(x)} is outside its domain`);
    }
  };
  t.cues.forEach((c: Partial<Cue>, i) => {
    const where = `cue ${c?.id ?? `#${i}`}`;
    if (!c || typeof c !== 'object') {
      out.push(`${where}: not an object`);
      return;
    }
    if (!c.id || !/^[a-z0-9_]+$/.test(c.id)) out.push(`${where}: id must be lowercase snake case`);
    if (c.id && seen.has(c.id)) out.push(`${where}: duplicate id`);
    if (c.id) seen.add(c.id);
    if (!c.event || !/^[a-z_]+(\.[a-z_]+)+$/.test(c.event))
      out.push(`${where}: event must look like domain.name`);
    const ways = [c.sound, c.select, c.pick].filter((x) => x !== undefined).length;
    if (ways !== 1) out.push(`${where}: give exactly one of sound, select, pick`);
    if (!BUSES.includes(c.bus as CueBus))
      out.push(`${where}: bus must be one of ${BUSES.join(', ')}`);
    if (c.group !== undefined && !GROUPS.includes(c.group))
      out.push(`${where}: group must be one of ${GROUPS.join(', ')}`);
    if (c.group !== undefined && c.bus !== 'sfx') out.push(`${where}: only sfx cues have a group`);
    if (!Number.isInteger(c.priority) || (c.priority as number) < 0 || (c.priority as number) > 5)
      out.push(`${where}: priority must be 0 to 5`);
    for (const b of c.boost ?? []) {
      if (!Number.isInteger(b.priority) || b.priority < 0 || b.priority > 5)
        out.push(`${where}: boost priority must be 0 to 5`);
      checkCond(`${where} boost`, b.when);
    }
    if (c.caption !== undefined && c.caption !== null && !CAPTION.test(c.caption))
      out.push(`${where}: caption must be a key audio.cap.<id>`);
    if (c.captionLevel !== undefined && c.captionLevel !== 'important' && c.captionLevel !== 'all')
      out.push(`${where}: captionLevel is important or all`);
    if (c.stinger && c.bus !== 'music') out.push(`${where}: stingers play on the music bus`);
    checkCond(where, c.when);
    checkCond(`${where} unless`, c.unless);
    if (c.select) {
      const slots = [...c.select.pattern.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((m) => m[1]!);
      for (const s of slots)
        if (!c.select.vars?.[s]) out.push(`${where}: pattern slot {${s}} has no field`);
      for (const f of Object.values(c.select.vars ?? {}))
        if (!fields[f]) out.push(`${where}: select field ${f} is not declared`);
    }
    if (c.pick && !fields[c.pick.field])
      out.push(`${where}: pick field ${c.pick.field} is not declared`);
    if (c.pick)
      for (const k of Object.keys(c.pick.map))
        if (!(fields[c.pick.field] ?? []).map(String).includes(k))
          out.push(`${where}: pick value ${k} is outside the domain`);
    if (ways === 1) {
      for (const s of soundsOf(c as Cue, fields)) {
        if (!SOUND_ID.test(s)) out.push(`${where}: ${s} is not a sound id`);
        else if (known && !known.has(s)) out.push(`${where}: ${s} is not in the prompt library`);
      }
    }
  });
  return out;
}

// The onboarding check (ux_and_onboarding.md 23.2 引导检查): every `tut_` trigger and every
// completion reads only registered flags (world_state_registry.md, D-076), real kernel event
// kinds or named signals; every step has a completion; every step can actually fire and end:
// a condition that rests only on a signal must rest on one the session produces
// (`SIGNAL_SOURCES`), and one that waits on another package is reported with that package,
// not failed; every step has the text keys its methods need, within the 19.2 limits and with
// no written key or button names (16.6 rule 6: keys come from `{key:}` glyphs); ids are
// unique and well formed; the steps carried match the 17.5 counts; a step the client shows has
// a method it can show, a silent one has none; a glow names its target; a prerequisite names
// a step that exists. Pure: the CLI (tools/tutorial/check.ts) and the tests feed it the
// registry, the event kinds and the string tables.

import {
  leaves,
  SHOWN_METHODS,
  SIGNAL_SOURCES,
  type TutAct,
  type TutCond,
  type TutSignal,
  type TutStep,
  textKeysOf,
} from './steps';

export { leaves };

export type TutFindingCode =
  | 'bad_id'
  | 'duplicate_id'
  | 'no_done'
  | 'unregistered_flag'
  | 'unknown_event'
  | 'unknown_signal'
  | 'unfirable'
  | 'missing_text'
  | 'too_long'
  | 'key_name'
  | 'count'
  | 'shows_nothing'
  | 'silent_shows'
  | 'glow_target'
  | 'unknown_requires';

export interface TutFinding {
  code: TutFindingCode;
  step: string;
  detail: string;
}

export interface TutCheckInput {
  steps: readonly TutStep[];
  /** the registry's answer for a flag name (aliases and family members count) */
  isRegistered(flag: string): boolean;
  /** every event kind the kernel declares */
  eventKinds: ReadonlySet<string>;
  /** every key of the source string tables */
  textKeys: ReadonlySet<string>;
  /** the 17.5 counts per act */
  counts: Readonly<Record<TutAct, number>>;
}

const ID = /^tut_(p|a[1-6]|any)_[a-z0-9_]+$/;

function isSignal(name: string): name is TutSignal {
  return Object.hasOwn(SIGNAL_SOURCES, name);
}

/** Whether a condition can hold today: now, only once some packages deliver, or never. */
export type Reach = { kind: 'now' } | { kind: 'waiting'; packages: string[] } | { kind: 'never' };

export function reachOf(cond: TutCond): Reach {
  switch (cond.kind) {
    case 'signal':
    case 'timer': {
      if (!isSignal(cond.signal)) return { kind: 'never' };
      const src = SIGNAL_SOURCES[cond.signal];
      return src === 'session' ? { kind: 'now' } : { kind: 'waiting', packages: [src.waiting] };
    }
    case 'story':
      return { kind: 'never' };
    case 'any': {
      const parts = cond.of.map(reachOf);
      if (parts.some((p) => p.kind === 'now')) return { kind: 'now' };
      const packages = [
        ...new Set(parts.flatMap((p) => (p.kind === 'waiting' ? p.packages : []))),
      ].sort();
      return packages.length ? { kind: 'waiting', packages } : { kind: 'never' };
    }
    default:
      return { kind: 'now' };
  }
}

/** A step that cannot fire or end until another package delivers its signal. */
export interface WaitingStep {
  step: string;
  where: 'trigger' | 'done';
  packages: string[];
}

/** The steps that wait (reported by the check, never failed). */
export function waitingSteps(steps: readonly TutStep[]): WaitingStep[] {
  const out: WaitingStep[] = [];
  for (const s of steps) {
    for (const where of ['trigger', 'done'] as const) {
      const r = reachOf(s[where]);
      if (r.kind === 'waiting') out.push({ step: s.id, where, packages: r.packages });
    }
  }
  return out;
}

function checkCond(
  step: TutStep,
  cond: TutCond,
  where: 'trigger' | 'done',
  input: TutCheckInput,
  out: TutFinding[],
): void {
  for (const c of leaves(cond)) {
    if (c.kind === 'flag' && !input.isRegistered(c.flag)) {
      out.push({ code: 'unregistered_flag', step: step.id, detail: `${where}: ${c.flag}` });
    }
    if (c.kind === 'event') {
      if (!input.eventKinds.has(c.event)) {
        out.push({ code: 'unknown_event', step: step.id, detail: `${where}: ${c.event}` });
      }
      // flag.changed names its flag in `key`: an exact name must be registered too
      if (c.event === 'flag.changed') {
        for (const w of c.where ?? []) {
          if (
            w.field === 'key' &&
            w.op === 'eq' &&
            typeof w.value === 'string' &&
            !input.isRegistered(w.value)
          ) {
            out.push({ code: 'unregistered_flag', step: step.id, detail: `${where}: ${w.value}` });
          }
        }
      }
    }
    if ((c.kind === 'signal' || c.kind === 'timer') && !isSignal(c.signal)) {
      out.push({ code: 'unknown_signal', step: step.id, detail: `${where}: ${c.signal}` });
    }
    if (c.kind === 'timer' && c.until && !isSignal(c.until)) {
      out.push({ code: 'unknown_signal', step: step.id, detail: `${where}: ${c.until}` });
    }
  }
  if (reachOf(cond).kind === 'never') {
    out.push({
      code: 'unfirable',
      step: step.id,
      detail: `${where}: rests on nothing the session or a package produces`,
    });
  }
}

/** Every finding, in a stable order (step, code, detail). */
export function checkTutorial(input: TutCheckInput): TutFinding[] {
  const out: TutFinding[] = [];
  const seen = new Set<string>();
  const ids = new Set(input.steps.map((s) => s.id));
  const perAct: Record<TutAct, number> = { p: 0, a1: 0, any: 0 };
  for (const s of input.steps) {
    perAct[s.act]++;
    if (!ID.test(s.id)) out.push({ code: 'bad_id', step: s.id, detail: 'not tut_<act>_<topic>' });
    if (seen.has(s.id)) out.push({ code: 'duplicate_id', step: s.id, detail: 'listed twice' });
    seen.add(s.id);
    if (!s.done) out.push({ code: 'no_done', step: s.id, detail: 'no completion' });
    else checkCond(s, s.done, 'done', input, out);
    checkCond(s, s.trigger, 'trigger', input, out);
    for (const k of textKeysOf(s)) {
      if (!input.textKeys.has(k)) out.push({ code: 'missing_text', step: s.id, detail: k });
    }
    const shows = s.methods.some((m) => SHOWN_METHODS.includes(m));
    if (s.silent && shows) {
      out.push({ code: 'silent_shows', step: s.id, detail: 'silent but has a shown method' });
    }
    if (!s.silent && !shows) {
      out.push({ code: 'shows_nothing', step: s.id, detail: 'no bar, glow, card or notification' });
    }
    if (s.methods.includes('glow') && !s.glowTarget) {
      out.push({ code: 'glow_target', step: s.id, detail: 'glow without a target' });
    }
    if (s.requires && !ids.has(s.requires)) {
      out.push({ code: 'unknown_requires', step: s.id, detail: s.requires });
    }
  }
  for (const act of Object.keys(input.counts) as TutAct[]) {
    if (perAct[act] !== input.counts[act]) {
      out.push({
        code: 'count',
        step: `tut_${act}`,
        detail: `${perAct[act]} steps, 17.5 lists ${input.counts[act]}`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.step.localeCompare(b.step) ||
      a.code.localeCompare(b.code) ||
      a.detail.localeCompare(b.detail),
  );
}

// ---------------------------------------------------------------------------
// The step text (19.2 limits; 16.6 rule 6: no written key names)

/** 19.2 limits in Chinese-character units by the last segment of a `tut.` key. */
export const TUT_LIMITS: Readonly<Record<string, number>> = {
  title: 10,
  body: 80,
  body2: 80,
  body3: 80,
  bar: 20,
  notify: 24,
};

/** Key, button and mouse words that must be `{key:}` glyphs or device-neutral wording. */
export const KEY_WORDS =
  /滚轮|扳机|十字键|面键|肩键|摇杆|左键|右键|中键|鼠标|点击|点一下|点“|点头像|手柄键|空格|回车/;

/** Display length: a placeholder counts as one character, ASCII as half (text_check's rule). */
export function displayLength(template: string): number {
  const text = template.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '〇');
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) < 0x2e80 ? 0.5 : 1;
  return n;
}

/** Findings over the `tut.` keys of a table: lengths and written key names. */
export function checkTutText(table: Readonly<Record<string, string>>): TutFinding[] {
  const out: TutFinding[] = [];
  // `textKey`, not `key`: these are text-table keys, not world flags (the registry's alias
  // guard reads `key.startsWith(...)` as a flag check)
  for (const [textKey, v] of Object.entries(table)) {
    if (!textKey.startsWith('tut.')) continue;
    const field = textKey.slice(textKey.lastIndexOf('.') + 1);
    const limit = TUT_LIMITS[field];
    const len = displayLength(v);
    if (limit !== undefined && len > limit) {
      out.push({ code: 'too_long', step: textKey, detail: `${field}: ${len} over ${limit}` });
    }
    const words = v.replace(/\{key:[a-z0-9_.]+\}/g, '');
    const m = KEY_WORDS.exec(words);
    if (m) out.push({ code: 'key_name', step: textKey, detail: m[0] });
  }
  return out.sort((a, b) => a.step.localeCompare(b.step) || a.code.localeCompare(b.code));
}

/** The glossary half of the check: its flags are registered and its text keys exist (17.7). */
export function checkGlossary(input: {
  flags: readonly string[];
  keys: readonly string[];
  isRegistered(flag: string): boolean;
  textKeys: ReadonlySet<string>;
}): TutFinding[] {
  const out: TutFinding[] = [];
  for (const f of input.flags) {
    if (!input.isRegistered(f))
      out.push({ code: 'unregistered_flag', step: 'glossary', detail: f });
  }
  for (const k of input.keys) {
    if (!input.textKeys.has(k)) out.push({ code: 'missing_text', step: 'glossary', detail: k });
  }
  return out;
}

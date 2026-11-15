// What the audio import does with one entry (audio_direction.md 8 to 11): bus and sound group,
// channels, loudness target and true-peak ceiling (the template's `loudness` and `truePeak`),
// loop rules, and the musical grid, layer and variant counts parsed from the entry's `extra`
// (the standard sentences of assets/prompts/README.md 6.2, e.g. "速度 76 BPM，4/4 拍；循环体 40
// 小节，约 126 秒；分层 3" or "在同一个文件里依次给出 4 个变体").

export type AudioKind = 'music' | 'ambience' | 'sfx' | 'ui';
export type Measure = 'I' | 'S' | 'M';

export interface AudioTemplateLike {
  duration?: string | number;
  loop?: boolean;
  sampleRate?: number;
  channels?: string;
  loudness?: string;
  truePeak?: string;
}

export interface AudioPlan {
  template: string;
  kind: AudioKind;
  bus: 'music' | 'ambience' | 'sfx' | 'ui';
  /** Sound-effect group for ducking and caps (8.2): combat, world, army, divine, cine. */
  group: string | null;
  sampleRate: number;
  channels: 1 | 2;
  loop: boolean;
  /** Longest allowed length of one output file (non-loop templates), seconds. */
  maxDurationSec: number | null;
  measure: Measure;
  targetLufs: number;
  truePeakMax: number;
  bpm: number | null;
  beatsPerBar: number | null;
  loopBars: number | null;
  /** Loop body length in seconds (from bars and tempo, or stated). */
  loopSec: number | null;
  /** Allowed loop body range in seconds (11.2). */
  loopRange: [number, number] | null;
  stems: number;
  variants: number;
  /** Loop crossfade length in milliseconds and its shape (dsp.bakeLoop). */
  fadeMs: number;
  fadeShape: 'power' | 'linear';
  /** Vorbis quality (9.1). */
  quality: number;
  /** Default voice priority (8.3); cues may override per trigger. */
  priority: number | null;
}

/** Ids of the dialogue sounds (text blips and the per-character tick). */
const DIALOGUE_SOUND = /^sfx_ui_(blip_|text_tick)/;

const GROUPS: Record<string, string> = {
  effect_combat: 'combat',
  effect_magic: 'combat',
  effect_creature: 'combat',
  effect_vocal: 'combat',
  effect_door: 'world',
  effect_item: 'world',
  effect_city: 'world',
  effect_env: 'world',
  effect_foot: 'world',
  effect_loop: 'world',
  effect_strategy: 'world',
  effect_army: 'army',
  effect_divine: 'divine',
  effect_cine: 'cine',
};

const PRIORITY: Record<string, number> = {
  combat: 3,
  world: 4,
  army: 3,
  divine: 2,
  cine: 0,
};

export function parseLoudness(s: string | undefined): { measure: Measure; lufs: number } {
  const m = /(-?\d+(?:\.\d+)?)\s*LUFS(?:-([ISM]))?/i.exec(s ?? '');
  if (!m) throw new Error(`bad loudness "${s}"`);
  return { measure: ((m[2] ?? 'I').toUpperCase() as Measure) ?? 'I', lufs: Number(m[1]) };
}

export function parseTruePeak(s: string | undefined): number {
  const m = /(-?\d+(?:\.\d+)?)\s*dBTP/i.exec(s ?? '');
  if (!m) throw new Error(`bad true peak "${s}"`);
  return Number(m[1]);
}

export interface ExtraFacts {
  bpm: number | null;
  beatsPerBar: number | null;
  loopBars: number | null;
  loopSec: number | null;
  stems: number | null;
  variants: number | null;
}

/**
 * Tempo beats per bar from a time signature: simple meters count the numerator (4/4 is 4);
 * compound meters in eighths count dotted quarters (6/8 is 2, 9/8 is 3, 12/8 is 4), the beat a
 * stated BPM refers to.
 */
function beatsOf(m: RegExpExecArray | null): number | null {
  if (!m) return null;
  const top = Number(m[1]);
  const bottom = Number(m[2]);
  return bottom === 8 && top % 3 === 0 && top > 3 ? top / 3 : top;
}

/** Facts from an entry's Chinese `extra` sentence (the English one is the fallback). */
export function parseExtra(extra: { zh?: string; en?: string } | undefined): ExtraFacts {
  const zh = extra?.zh ?? '';
  const en = extra?.en ?? '';
  const num = (re: RegExp, s: string): number | null => {
    const m = re.exec(s);
    return m ? Number(m[1]) : null;
  };
  return {
    bpm: num(/(\d+(?:\.\d+)?)\s*BPM/i, zh) ?? num(/(\d+(?:\.\d+)?)\s*BPM/i, en),
    beatsPerBar: beatsOf(/(\d+)\s*\/\s*(\d+)\s*拍/.exec(zh)),
    loopBars: num(/循环体\s*(\d+)\s*小节/, zh) ?? num(/loop body (\d+) bars/i, en),
    loopSec:
      num(/循环体[^；;。]*?约\s*(\d+(?:\.\d+)?)\s*秒/, zh) ??
      num(/loop body[^;.]*?about (\d+(?:\.\d+)?) seconds/i, en),
    stems: num(/分层\s*(\d+)/, zh) ?? num(/(\d+) layers/i, en),
    variants: num(/(\d+)\s*个变体/, zh) ?? num(/(\d+) variations/i, en),
  };
}

export function audioPlanOf(
  template: string,
  t: AudioTemplateLike,
  extra?: { zh?: string; en?: string },
  id?: string,
): AudioPlan {
  const kind: AudioKind = template.startsWith('music_')
    ? 'music'
    : template.startsWith('ambience_')
      ? 'ambience'
      : template.startsWith('effect_ui')
        ? 'ui'
        : 'sfx';
  const facts = parseExtra(extra);
  const parsed = parseLoudness(t.loudness);
  const measure = parsed.measure;
  // Dialogue blips and the text tick sit 6 LU under other interface sounds (8.1).
  const lufs = id && DIALOGUE_SOUND.test(id) ? -26 : parsed.lufs;
  const loop = t.duration === 'loop' || t.loop === true;
  let loopSec = facts.loopSec;
  if (facts.bpm && facts.loopBars) {
    const grid = (60 / facts.bpm) * (facts.beatsPerBar ?? 4) * facts.loopBars;
    // The tempo grid wins unless it contradicts the stated length (an unusual meter or a
    // BPM counted in another note value): then the stated seconds are used.
    loopSec = facts.loopSec && Math.abs(grid / facts.loopSec - 1) > 0.1 ? facts.loopSec : grid;
  }
  const loopRange: [number, number] | null = !loop
    ? null
    : kind === 'music'
      ? loopSec
        ? [loopSec * 0.97, loopSec * 1.03]
        : [20, 600]
      : template === 'ambience_bed'
        ? [60, 120]
        : [4, 8];
  const group = kind === 'sfx' ? (GROUPS[template] ?? 'world') : null;
  const maxDurationSec = typeof t.duration === 'number' ? t.duration : null;
  return {
    template,
    kind,
    bus:
      kind === 'music' ? 'music' : kind === 'ambience' ? 'ambience' : kind === 'ui' ? 'ui' : 'sfx',
    group,
    sampleRate: t.sampleRate ?? 48000,
    channels: t.channels === 'mono' ? 1 : 2,
    loop,
    maxDurationSec,
    measure,
    targetLufs: lufs,
    truePeakMax: parseTruePeak(t.truePeak),
    bpm: facts.bpm,
    beatsPerBar: facts.bpm ? (facts.beatsPerBar ?? 4) : null,
    loopBars: facts.loopBars,
    loopSec,
    loopRange,
    stems: facts.stems ?? 1,
    variants: facts.variants ?? 1,
    fadeMs: kind === 'music' ? 1500 : template === 'ambience_bed' ? 2000 : 200,
    fadeShape: kind === 'music' ? 'linear' : 'power',
    quality: kind === 'music' || kind === 'ambience' ? 5 : 4,
    priority:
      kind === 'ui' ? 1 : template === 'ambience_point' ? 5 : group ? (PRIORITY[group] ?? 4) : null,
  };
}

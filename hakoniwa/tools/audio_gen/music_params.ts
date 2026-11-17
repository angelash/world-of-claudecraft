// ACE-Step parameters from a music entry's `extra` sentence (the standard sentences of
// assets/prompts/README.md 6.2): key and mode mapped onto ACE-Step's major/minor keyscale
// list, time signature onto its 2, 3, 4, 6 choices, and the length to generate for each
// music template. Pure, unit tested in tests/audio_gen_midi.test.ts.

export type AceTimeSignature = '2' | '3' | '4' | '6';

const MINORISH = ['minor', 'dorian', 'phrygian', 'aeolian', 'locrian'];

/** Roots ACE-Step lists, with flats and sharps as written there. */
const ROOTS = new Set([
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
]);

/**
 * The keyscale ACE-Step takes ("D major", "F# minor"). Church modes map by their third:
 * Dorian, Phrygian, Aeolian and Locrian to minor; Lydian and Mixolydian to major.
 * Returns null when the sentence names no key.
 */
export function keyscaleOf(extra: { zh?: string; en?: string } | undefined): string | null {
  const en = extra?.en ?? '';
  const m =
    /\b([A-G])(?:[- ]?(sharp|flat|#|b))?\s+(major|minor|dorian|phrygian|lydian|mixolydian|aeolian|locrian|pentatonic)\b/i.exec(
      en,
    );
  if (m) {
    const acc = m[2]?.toLowerCase();
    const root = `${(m[1] as string).toUpperCase()}${acc === 'sharp' || acc === '#' ? '#' : acc === 'flat' || acc === 'b' ? 'b' : ''}`;
    const mode = (m[3] as string).toLowerCase();
    if (!ROOTS.has(root)) return null;
    return `${root} ${MINORISH.includes(mode) ? 'minor' : 'major'}`;
  }
  // "centered on E, tonally ambiguous" takes that centre as a minor key; "atonal" leans on
  // the house tonic D in minor; "mainly in D" is D major.
  const rootOf = (letter: string, acc: string | undefined) =>
    `${letter.toUpperCase()}${acc === 'sharp' ? '#' : acc === 'flat' ? 'b' : ''}`;
  const centre = /centered on ([A-G])(?:[- ]?(sharp|flat))?/i.exec(en);
  if (centre) return `${rootOf(centre[1] as string, centre[2]?.toLowerCase())} minor`;
  if (/\batonal\b|tonally ambiguous/i.test(en)) return 'D minor';
  const plain = /\bin ([A-G])(?:[- ]?(sharp|flat))?\b/.exec(en);
  if (plain) return `${rootOf(plain[1] as string, plain[2]?.toLowerCase())} major`;
  const zh = extra?.zh ?? '';
  const z = /(升|降)?\s*([A-G])\s*(大调|小调|多利亚|弗里吉亚|利底亚|混合利底亚|伊奥利亚)/.exec(zh);
  if (z) {
    const root = `${z[2]}${z[1] === '升' ? '#' : z[1] === '降' ? 'b' : ''}`;
    if (!ROOTS.has(root)) return null;
    const minor = ['小调', '多利亚', '弗里吉亚', '伊奥利亚'].includes(z[3] as string);
    return `${root} ${minor ? 'minor' : 'major'}`;
  }
  return null;
}

const WORD_METER: Record<string, AceTimeSignature> = {
  'two-four': '2',
  'three-four': '3',
  'four-four': '4',
  'six-eight': '6',
  'nine-eight': '3',
  'twelve-eight': '4',
};

/** ACE-Step's time signature choice; four-four when the sentence names none. */
export function timeSignatureOf(extra: { zh?: string; en?: string } | undefined): AceTimeSignature {
  const en = (extra?.en ?? '').toLowerCase();
  for (const [words, sig] of Object.entries(WORD_METER)) if (en.includes(words)) return sig;
  const m = /(\d+)\s*\/\s*(\d+)\s*拍/.exec(extra?.zh ?? '') ?? /\b(\d+)\/(\d+)\b/.exec(en);
  if (m) {
    const top = Number(m[1]);
    const bottom = Number(m[2]);
    if (bottom === 8 && top === 6) return '6';
    if (bottom === 8 && top === 9) return '3';
    if (bottom === 8 && top === 12) return '4';
    if (top === 2 || top === 3 || top === 4) return String(top) as AceTimeSignature;
  }
  return '4';
}

/** "about 85 seconds" or "约 85 秒": the first stated length in seconds, or null. */
export function statedSeconds(extra: { zh?: string; en?: string } | undefined): number | null {
  const en = /about (\d+(?:\.\d+)?) seconds/i.exec(extra?.en ?? '');
  if (en) return Number(en[1]);
  const zh = /约\s*(\d+(?:\.\d+)?)\s*秒/.exec(extra?.zh ?? '');
  return zh ? Number(zh[1]) : null;
}

/**
 * Seconds of music to generate. Loops get 1.6 times the loop body (audio_direction.md
 * 11.2 asks for 1.5 to 2 times, so the import can pick the seam), cues their stated length,
 * stingers at least ACE-Step's 10-second minimum; everything stays inside the template cap.
 */
export function generationSeconds(
  template: string,
  loopSec: number | null,
  stated: number | null,
  templateMax: number | null,
): number {
  const cap = templateMax ?? 240;
  const within = (s: number) =>
    Math.round(Math.min(Math.max(s, 10), Math.max(cap, 10)) * 100) / 100;
  if (template === 'music_loop')
    return Math.round(Math.min(Math.max((loopSec ?? 90) * 1.6, 30), 240) * 100) / 100;
  if (template === 'music_stinger') return within(Math.max(10, (stated ?? 6) + 2));
  return within(stated ?? cap);
}

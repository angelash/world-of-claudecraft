// Audio manifest (audio_direction.md 9.2 to 9.4, 10.1): reads the asset manifest's audio
// records and the processed metadata next to each processed sound (assets/processed/audio/
// <outDir>/<id>.json, written by `npm run assets:import`), checks them, and keeps the index the
// engine plays from. Only approved records whose processed result belongs to this import
// version and to the recorded source file are playable (9.2: an id without an approved result
// stays silent; there is no placeholder sound). Also the per-map pack of ids to decode ahead
// (9.4). Pure: fetching and decoding live in ./audio_loader.ts.

export type AudioKindName = 'music' | 'ambience' | 'sfx' | 'ui';

/** A manifest record as the loader sees it (assets/manifest.json). */
export interface AudioRecordLike {
  id: string;
  kind: string;
  status: string;
  file: string;
  sha256?: string;
}

/** The processed metadata fields the engine reads (9.3; tools/assets/core/audio/meta.ts). */
export interface AudioMetaLike {
  id: string;
  kind: AudioKindName;
  bus: AudioKindName;
  group: string | null;
  files: string[];
  durationSec: number;
  loop: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  bpm: number | null;
  beatsPerBar: number | null;
  bars: number | null;
  stems: number;
  variants: number;
  channels: 'mono' | 'stereo';
  syncOffsetMs: number | null;
  priority: number | null;
  caption: string | null;
  importVersion: string;
  source?: { sha256?: string };
}

/** One playable sound. */
export interface AudioEntry {
  id: string;
  kind: AudioKindName;
  bus: AudioKindName;
  group: string | null;
  /** Processed files relative to assets/: stems in layer order, or variants, or the one file. */
  files: string[];
  /** The files are layers of one track (L1 first). */
  layered: boolean;
  durationSec: number;
  loop: boolean;
  /** Loop body in seconds (whole file for baked loops). */
  loopStartSec: number;
  loopEndSec: number;
  bpm: number | null;
  beatsPerBar: number | null;
  channels: 'mono' | 'stereo';
  syncOffsetMs: number;
  priority: number | null;
  caption: string | null;
}

/** Processed audio is 48 kHz (9.1). */
export const AUDIO_RATE = 48000;
const KINDS: readonly AudioKindName[] = ['music', 'ambience', 'sfx', 'ui'];

/** Problems that keep a processed sound out of the game (empty: playable). */
export function audioMetaProblems(
  rec: AudioRecordLike,
  meta: AudioMetaLike | null | undefined,
  importVersion: string,
): string[] {
  const out: string[] = [];
  if (!meta || typeof meta !== 'object') return [`${rec.id}: no processed metadata`];
  if (meta.id !== rec.id) out.push(`${rec.id}: metadata names ${String(meta.id)}`);
  if (meta.importVersion !== importVersion)
    out.push(`${rec.id}: made by import ${String(meta.importVersion)}, not ${importVersion}`);
  if (rec.sha256 && meta.source?.sha256 !== rec.sha256)
    out.push(`${rec.id}: processed from another source file`);
  if (!KINDS.includes(meta.kind)) out.push(`${rec.id}: unknown kind ${String(meta.kind)}`);
  if (!KINDS.includes(meta.bus)) out.push(`${rec.id}: unknown bus ${String(meta.bus)}`);
  if (!Array.isArray(meta.files) || meta.files.length === 0) out.push(`${rec.id}: no files`);
  else {
    if (meta.stems > 1 && meta.files.length !== meta.stems)
      out.push(`${rec.id}: ${meta.files.length} files for ${meta.stems} layers`);
    if (meta.variants > 1 && meta.files.length !== meta.variants)
      out.push(`${rec.id}: ${meta.files.length} files for ${meta.variants} variants`);
    if (meta.stems > 1 && meta.variants > 1) out.push(`${rec.id}: layers and variants together`);
  }
  if (!(typeof meta.durationSec === 'number' && meta.durationSec > 0))
    out.push(`${rec.id}: no duration`);
  if (meta.loop) {
    const ls = meta.loopStart;
    const le = meta.loopEnd;
    if (ls === null || le === null || !(ls >= 0 && le > ls))
      out.push(`${rec.id}: a loop without loop points`);
  }
  if (meta.bpm !== null && !(meta.bpm > 0)) out.push(`${rec.id}: bpm must be positive`);
  return out;
}

/** The playable entry of a checked record. */
export function entryOf(meta: AudioMetaLike): AudioEntry {
  const loopStartSec = meta.loop && meta.loopStart !== null ? meta.loopStart / AUDIO_RATE : 0;
  const loopEndSec =
    meta.loop && meta.loopEnd !== null ? meta.loopEnd / AUDIO_RATE : meta.durationSec;
  return {
    id: meta.id,
    kind: meta.kind,
    bus: meta.bus,
    group: meta.group,
    files: [...meta.files],
    layered: meta.stems > 1,
    durationSec: meta.durationSec,
    loop: meta.loop,
    loopStartSec,
    loopEndSec,
    bpm: meta.bpm,
    beatsPerBar: meta.beatsPerBar,
    channels: meta.channels === 'mono' ? 'mono' : 'stereo',
    syncOffsetMs: meta.syncOffsetMs ?? 0,
    priority: meta.priority,
    caption: meta.caption,
  };
}

export class AudioIndex {
  private readonly entries = new Map<string, AudioEntry>();

  constructor(entries: Iterable<AudioEntry> = []) {
    for (const e of entries) this.entries.set(e.id, e);
  }

  get(id: string): AudioEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }
}

/** Build the index from records and their metadata; the problems explain what was left out. */
export function buildAudioIndex(
  records: readonly AudioRecordLike[],
  meta: (rec: AudioRecordLike) => AudioMetaLike | null | undefined,
  importVersion: string,
): { index: AudioIndex; problems: string[] } {
  const problems: string[] = [];
  const entries: AudioEntry[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    if (rec.kind !== 'audio' || rec.status !== 'approved') continue;
    if (seen.has(rec.id)) {
      problems.push(`${rec.id}: approved twice`);
      continue;
    }
    seen.add(rec.id);
    const m = meta(rec);
    const p = audioMetaProblems(rec, m, importVersion);
    if (p.length > 0 || !m) problems.push(...p);
    else entries.push(entryOf(m));
  }
  return { index: new AudioIndex(entries), problems };
}

/** The approved audio records of a manifest (the files whose metadata the loader fetches). */
export function approvedAudio(raw: unknown): AudioRecordLike[] {
  return (Array.isArray(raw) ? raw : []).filter(
    (r): r is AudioRecordLike =>
      !!r &&
      typeof r === 'object' &&
      (r as AudioRecordLike).kind === 'audio' &&
      (r as AudioRecordLike).status === 'approved' &&
      typeof (r as AudioRecordLike).id === 'string' &&
      typeof (r as AudioRecordLike).file === 'string',
  );
}

/**
 * The ids a map's pack decodes on entry (9.4): its tracks, beds and details, plus the shared
 * ids every map needs (interface sounds, the combat core). Unknown ids are left out.
 */
export function mapPack(
  index: AudioIndex,
  map: {
    music?: string | null;
    musicNight?: string | null;
    ambience?: readonly (string | { id: string })[];
    ambiencePoints?: readonly { id: string }[];
  },
  shared: readonly string[] = [],
): string[] {
  const ids = [
    map.music,
    map.musicNight,
    ...(map.ambience ?? []).map((b) => (typeof b === 'string' ? b : b.id)),
    ...(map.ambiencePoints ?? []).map((p) => p.id),
    ...shared,
  ];
  return [...new Set(ids.filter((id): id is string => !!id && index.has(id)))];
}

// Audio loader (audio_direction.md 9.2 to 9.4): the DOM side of ./audio_manifest.ts. It reads
// assets/manifest.json, fetches the processed metadata of every approved audio record and
// builds the index the engine plays from; decoding happens later, per map pack, in the bus.
// Like the art loader (src/client/assets/loader.ts) it serves development builds, where the
// dev server hands out assets/ as files: whatever `npm run assets:import` writes is heard on
// the next reload. Release builds stay silent until the audio packing step ships the approved
// files with the build (release_engineering.md 9.5). Never throws: with no manifest, no
// approved audio or a broken record, the index is smaller and the game simply has less sound.

import { IMPORT_VERSION } from '../../../tools/assets/core/meta';
import { metaPathOf } from '../assets/types';
import {
  type AudioIndex,
  type AudioMetaLike,
  type AudioRecordLike,
  approvedAudio,
  buildAudioIndex,
} from './audio_manifest';

/** Where the dev server serves hakoniwa/assets/. */
export const DEV_AUDIO_BASE = '/assets/';

export interface AudioLoadOptions {
  base?: string;
  fetchJson?: (url: string) => Promise<unknown>;
}

async function fetchJsonDefault(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Read the manifest and the approved records' metadata into a playable index. */
export async function loadAudioIndex(
  opts: AudioLoadOptions = {},
): Promise<{ index: AudioIndex; problems: string[] }> {
  const base = opts.base ?? DEV_AUDIO_BASE;
  const fetchJson = opts.fetchJson ?? fetchJsonDefault;
  let raw: unknown = [];
  try {
    raw = await fetchJson(`${base}manifest.json`);
  } catch {
    raw = [];
  }
  const records = approvedAudio(raw);
  const metas = new Map<string, AudioMetaLike | null>();
  await Promise.all(
    records.map(async (r: AudioRecordLike) => {
      try {
        metas.set(r.id, (await fetchJson(`${base}${metaPathOf(r.file)}`)) as AudioMetaLike);
      } catch {
        metas.set(r.id, null);
      }
    }),
  );
  return buildAudioIndex(records, (r) => metas.get(r.id), IMPORT_VERSION);
}

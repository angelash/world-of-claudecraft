// Release audio has already passed the build-time approval and import checks.

import { releasePath } from '../assets/release_loader';
import { type AudioEntry, AudioIndex } from './audio_manifest';

export const RELEASE_AUDIO_BASE = '/audio/';

export async function loadReleaseAudio(
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  },
): Promise<{ index: AudioIndex; problems: string[] }> {
  try {
    const raw = (await fetchJson(`${RELEASE_AUDIO_BASE}manifest.json`)) as {
      version?: number;
      entries?: AudioEntry[];
    };
    if (raw?.version !== 1 || !Array.isArray(raw.entries)) {
      throw new Error('release audio manifest is invalid');
    }
    const entries = raw.entries.filter(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        Array.isArray(e.files) &&
        e.files.length > 0 &&
        e.files.every(releasePath) &&
        Number.isFinite(e.durationSec) &&
        e.durationSec > 0,
    );
    return { index: new AudioIndex(entries), problems: [] };
  } catch {
    return { index: new AudioIndex(), problems: ['release audio pack is unavailable'] };
  }
}

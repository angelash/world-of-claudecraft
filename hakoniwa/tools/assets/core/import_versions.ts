// Bump the affected pipeline whenever its processed output can change. Art-only changes
// leave the current audio cache valid, including its encoded files and metadata.
export const ART_IMPORT_VERSION = '1.0.18';
export const AUDIO_IMPORT_VERSION = '1.0.17';

/** Exact current version for a manifest record, never a range of accepted old versions. */
export function importVersionFor(kind: 'art' | 'audio'): string {
  return kind === 'audio' ? AUDIO_IMPORT_VERSION : ART_IMPORT_VERSION;
}

// Review reason codes (art_pipeline.md 15.3; audio_direction.md 12.1) and the problem record
// every pipeline step and check reports. A problem names the reason code the manifest stores
// (`reason`), the check that found it, and a message for the pre-review report.

export const ART_REASONS = [
  'identity',
  'frames',
  'direction',
  'silhouette',
  'scale',
  'light',
  'text',
  'seam',
  'palette',
  'readability',
  'originality',
  'spoiler',
  'quality',
  'background',
] as const;

/** Audio codes: seam (loop), loudness (also true peak), motif, style, vocal, similarity, sync; format for technical specs. */
export const AUDIO_REASONS = [
  'seam',
  'loudness',
  'motif',
  'style',
  'vocal',
  'similarity',
  'sync',
  'format',
] as const;

export type ArtReason = (typeof ART_REASONS)[number];
export type AudioReason = (typeof AUDIO_REASONS)[number];
export type ReasonCode = ArtReason | AudioReason;

export interface Problem {
  code: ReasonCode;
  /** Short id of the check (e.g. 'grid_cells', 'true_peak', 'loop_points'). */
  check: string;
  message: string;
  /** Warnings go to the pre-review report for a human decision; they do not fail the asset. */
  warning?: boolean;
}

export function problem(
  code: ReasonCode,
  check: string,
  message: string,
  warning = false,
): Problem {
  return warning ? { code, check, message, warning } : { code, check, message };
}

/** Reason string for the manifest: the distinct failing codes, sorted, comma separated. */
export function reasonOf(problems: readonly Problem[]): string {
  return [...new Set(problems.filter((p) => !p.warning).map((p) => p.code))].sort().join(',');
}

export function isReasonList(value: string, kind: 'art' | 'audio'): boolean {
  if (value === '') return false;
  const allowed: readonly string[] = kind === 'art' ? ART_REASONS : AUDIO_REASONS;
  return value.split(',').every((c) => allowed.includes(c.trim()));
}

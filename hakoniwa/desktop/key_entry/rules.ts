// Checks the main process runs on a key the key entry window submitted
// (docs/50_tech/llm_providers.md 5.5): not empty, at most 512 characters, no whitespace and
// no control characters. The answer is a reason code only; the key is never echoed.

export const MAX_KEY_LENGTH = 512;

export type KeyRejection = 'empty' | 'too_long' | 'bad_chars';

/** Whitespace, C0 and C1 controls, DEL, and the zero-width space, joiner and non-joiner. */
function badCodePoint(c: number): boolean {
  return c <= 0x20 || (c >= 0x7f && c <= 0xa0) || (c >= 0x200b && c <= 0x200d);
}

export function checkKeyText(text: unknown): { ok: true } | { ok: false; reason: KeyRejection } {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > MAX_KEY_LENGTH) return { ok: false, reason: 'too_long' };
  if (/\s/.test(text)) return { ok: false, reason: 'bad_chars' };
  for (let i = 0; i < text.length; i++) {
    if (badCodePoint(text.charCodeAt(i))) return { ok: false, reason: 'bad_chars' };
  }
  return { ok: true };
}

/** Clipboard text is trimmed of surrounding whitespace before the same check. */
export function keyFromClipboard(text: string): string {
  return text.trim();
}

/** Last four characters for status lines, or nothing for a key too short to hide. */
export function last4(secret: string): string | undefined {
  return secret.length >= 12 ? secret.slice(-4) : undefined;
}

// Player-visible text as data (D-077, D-087; release_engineering.md 8.1). The kernel, the
// systems and the game flow never hold a sentence: they hold a TextRef, a text key plus
// parameters, or the raw text a model wrote tagged with its language. The client renders
// a TextRef with the string tables under locales/ (src/shared_ui/i18n.ts); the kernel
// never looks a key up. Entity, item and place parameters are ids, display names, or
// nested TextRefs (`{ who: { key: 'c.npcs.ron.name' } }`). Pure and deterministic.

/** A template parameter: a plain value or a nested text reference. */
export type TextParam = string | number | TextRef;

/** A text key with parameters, rendered by the client from the string tables. */
export interface KeyText {
  key: string;
  params?: Record<string, TextParam>;
}

/** Text a model (or the player) wrote, kept as written with the language it was written in. */
export interface RawText {
  raw: string;
  lang: string;
}

export type TextRef = KeyText | RawText;

/** The source language of every string table (D-077). */
export const SOURCE_LANG = 'zh-Hans';

/** Key prefix of the list joiners: `sys.common.join.<sep>`; the table value is the separator. */
export const JOIN_PREFIX = 'sys.common.join.';

/** A text reference to `key`; `params` fill its `{name}` placeholders. */
export function tr(key: string, params?: Record<string, TextParam>): KeyText {
  return params ? { key, params } : { key };
}

/** Raw text tagged with its language (model output, player words). */
export function rawText(raw: string, lang: string = SOURCE_LANG): RawText {
  return { raw, lang };
}

/**
 * Items joined by the separator `sys.common.join.<sep>` names (for example `comma` for
 * '，', `list` for '、', `semicolon` for '；', `none` for plain concatenation). The
 * items are the params '0', '1', ... in order, so a list stays one TextRef.
 */
export function joinText(sep: string, items: readonly TextParam[]): KeyText {
  const params: Record<string, TextParam> = {};
  items.forEach((item, i) => {
    params[String(i)] = item;
  });
  return { key: `${JOIN_PREFIX}${sep}`, params };
}

/** Key of the clip directive: the rendered `text` param cut to its first `n` UTF-16 units. */
export const CLIP_KEY = 'sys.common.clip';

/**
 * The first `n` UTF-16 units of a text, like String.prototype.slice(0, n): done here for a
 * plain string, deferred to rendering (the clip directive) for a TextRef.
 */
export function clipText(v: TextParam, n: number): TextParam {
  if (typeof v === 'string') return v.slice(0, n);
  if (typeof v === 'number') return String(v).slice(0, n);
  return { key: CLIP_KEY, params: { text: v, n } };
}

/**
 * Free text from a command's data (a spoken line, a note, a diary entry). The model writes
 * plain strings: `clean` normalises them (trim, caps) and they are kept as raw text in the
 * language they were written in (D-087; 1.0 prompts and answers are in the source
 * language). The kernel's own rule fallbacks may pass a string, kept as cleaned, or a
 * TextRef, kept and capped at `cap` UTF-16 units with clipText the way a string would be.
 * A TextRef from the model, or anything that is not text, gives ''.
 */
export function commandText(
  v: unknown,
  fromModel: boolean,
  clean: (s: string) => string,
  cap?: number,
): TextParam {
  if (typeof v === 'string') {
    const s = clean(v);
    return fromModel && s ? rawText(s) : s;
  }
  if (fromModel || !isTextRef(v)) return '';
  return cap === undefined ? v : clipText(v, cap);
}

/** Text keys live in the scopes ui., sys., tut. and c. (ux_and_onboarding.md 20.2). */
const KEY_SCOPE = /^(sys|ui|tut|c)\./;

/**
 * True for a value shaped exactly like a TextRef (and nothing else): a scoped text key with
 * optional params, or raw text with its language. Plain data such as `{ key: 'seal' }` is not.
 */
export function isTextRef(v: unknown): v is TextRef {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (typeof o.key === 'string') {
    if (!KEY_SCOPE.test(o.key)) return false;
    if (keys.length === 1) return true;
    return (
      keys.length === 2 &&
      'params' in o &&
      (o.params === undefined || (typeof o.params === 'object' && o.params !== null))
    );
  }
  return keys.length === 2 && typeof o.raw === 'string' && typeof o.lang === 'string';
}

/** Structural equality of two text values (keys, params and nesting), for dedupe checks. */
export function textEquals(a: TextParam | undefined, b: TextParam | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if ('raw' in a || 'raw' in b) {
    return 'raw' in a && 'raw' in b && a.raw === b.raw && a.lang === b.lang;
  }
  if (a.key !== b.key) return false;
  const pa = a.params ?? {};
  const pb = b.params ?? {};
  const ka = Object.keys(pa);
  if (ka.length !== Object.keys(pb).length) return false;
  return ka.every((k) => k in pb && textEquals(pa[k], pb[k]));
}

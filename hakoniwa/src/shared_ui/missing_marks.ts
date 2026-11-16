// Missing-text marks (ux_and_onboarding.md 20.3: a missing parameter keeps its placeholder,
// and dev builds highlight it in red):
// finds, in rendered text, the spans a dev build highlights in red: a placeholder the
// renderer left unfilled (`{name}`, `{n, number}`, `{key:<action>}` before the glyph table)
// and a text key rendered as its own name because no table had it (`ui.win.x.y`). Pure; the
// dev painter (src/client/app/dev_text_marks.ts) wraps the spans in the DOM.

export interface TextMark {
  start: number;
  end: number;
  kind: 'param' | 'key';
}

/** An unfilled placeholder: `{name}` or `{name, type ...}` (no nested braces). */
const PLACEHOLDER = /\{\s*[\w:<>]+\s*(?:,[^{}]*)?\}/g;
/** A scoped text key shown as itself. */
const KEY = /\b(?:ui|sys|tut|c)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+\b/g;

/** Every missing-text span of `text`, in order, never overlapping. */
export function missingTextMarks(text: string): TextMark[] {
  const out: TextMark[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) {
    out.push({ start: m.index, end: m.index + m[0].length, kind: 'param' });
  }
  for (const m of text.matchAll(KEY)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!out.some((o) => start < o.end && end > o.start)) out.push({ start, end, kind: 'key' });
  }
  return out.sort((a, b) => a.start - b.start);
}

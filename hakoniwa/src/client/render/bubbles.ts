// Speech bubbles above speakers (art_pipeline_2d.md 7.2): the first sentence of a
// dialogue.line, wrapped for CJK text, held 3 to 6 seconds by length, at most one per
// speaker and a capped number of thought bubbles on screen. Pure; Node-tested.

export type BubbleKind = 'say' | 'think' | 'narrate' | 'divine';

export interface Bubble {
  speakerId: string;
  text: string;
  kind: BubbleKind;
  start: number;
  until: number;
}

const SENTENCE_END = /[。！？!?\n]/;

/** First sentence of a line, cut to maxChars (ellipsis when cut). */
export function firstSentence(text: string, maxChars = 24): string {
  const t = text.trim();
  const m = SENTENCE_END.exec(t);
  let s = m ? t.slice(0, m.index + (m[0] === '\n' ? 0 : 1)) : t;
  s = s.trim();
  const chars = Array.from(s);
  if (chars.length > maxChars) return `${chars.slice(0, maxChars - 1).join('')}…`;
  return s;
}

/** Visual width of a character: CJK and full-width count as 2, others as 1. */
export function charWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x2e80 ? 2 : 1;
}

/** Wrap into at most maxLines lines of maxWidth half-width units (ellipsis when cut). */
export function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  let truncated = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    const w = charWidth(ch);
    if (curW + w > maxWidth && cur) {
      lines.push(cur);
      cur = '';
      curW = 0;
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    }
    if (ch === ' ' && !cur) continue;
    cur += ch;
    curW += w;
  }
  if (!truncated && cur) lines.push(cur);
  if (truncated && maxLines > 0) {
    const last = Array.from(lines[maxLines - 1] as string);
    last[last.length - 1] = '…';
    lines[maxLines - 1] = last.join('');
  }
  return lines;
}

export function bubbleDuration(text: string): number {
  return Math.max(3000, Math.min(6000, 2200 + Array.from(text).length * 160));
}

export const MAX_THOUGHTS = 2;

export class BubbleBoard {
  private bubbles = new Map<string, Bubble>();

  /** Show a line over its speaker; narration never gets a bubble. */
  add(speakerId: string, text: string, kind: BubbleKind, nowMs: number): void {
    if (kind === 'narrate' || !speakerId) return;
    const sentence = firstSentence(text);
    if (!sentence) return;
    this.bubbles.set(speakerId, {
      speakerId,
      text: sentence,
      kind,
      start: nowMs,
      until: nowMs + bubbleDuration(sentence),
    });
  }

  /** Bubbles still showing, oldest first; thought bubbles beyond the cap are dropped. */
  active(nowMs: number): Bubble[] {
    const out: Bubble[] = [];
    for (const [id, b] of this.bubbles) {
      if (b.until <= nowMs) this.bubbles.delete(id);
      else out.push(b);
    }
    out.sort((a, b) => a.start - b.start);
    const thoughts = out.filter((b) => b.kind === 'think');
    if (thoughts.length > MAX_THOUGHTS) {
      const drop = new Set(thoughts.slice(0, thoughts.length - MAX_THOUGHTS));
      return out.filter((b) => !drop.has(b));
    }
    return out;
  }

  clear(): void {
    this.bubbles.clear();
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Push overlapping boxes upward so bubbles do not cover each other. Boxes are processed
 * bottom to top (nearest speakers keep their place). Returns adjusted copies.
 */
export function layoutBoxes(boxes: readonly Box[], gap = 2): Box[] {
  const order = boxes.map((b, i) => ({ b: { ...b }, i })).sort((a, z) => z.b.y - a.b.y);
  const placed: Box[] = [];
  for (const o of order) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 32) {
      moved = false;
      for (const p of placed) {
        const overlapX = o.b.x < p.x + p.w && o.b.x + o.b.w > p.x;
        const overlapY = o.b.y < p.y + p.h + gap && o.b.y + o.b.h + gap > p.y;
        if (overlapX && overlapY) {
          o.b.y = p.y - o.b.h - gap;
          moved = true;
        }
      }
    }
    placed.push(o.b);
  }
  const out: Box[] = new Array(boxes.length);
  for (const o of order) out[o.i] = o.b;
  return out;
}

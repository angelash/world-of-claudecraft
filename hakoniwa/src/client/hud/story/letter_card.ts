// The letter step of `ui_mode_cutscene` (catalog_cutscenes.md 13.1 "信"; ux_and_onboarding.md
// 6.3.8): a cutscene node's `letter` directive shows an `ltr_` letter on paper (sender, seal,
// subject, paragraphs) as a step of its own; auto advance stops on it. It reads the delivered
// letter from the records' inbox (the paragraphs frozen when it was sent) and falls back to the
// letter's content definition (the paragraphs whose condition holds now) when it is not in the
// inbox yet. Text is content refs, rendered by the painter. Pure; Node-tested.

import { contentRef, contentText } from '../../../core/content_key';
import type { ContentMap, FlagValue } from '../../../core/contracts';
import type { TextParam } from '../../../core/text';
import type { World } from '../../../core/world';
import { evaluate, flagResolver } from '../../../systems/quests/conditions';
import { inbox } from '../../../systems/records/view';

export interface LetterCard {
  id: string;
  sender: TextParam;
  seal: string;
  subject: TextParam;
  paragraphs: TextParam[];
  /** read from the inbox (delivered) rather than the definition */
  delivered: boolean;
}

interface LetterDefLike {
  id: string;
  sender?: string;
  senderName?: string;
  seal: string;
  subject: string;
  body: { id: string; text: string; when?: string }[];
}

function personName(content: ContentMap, id: string): TextParam {
  for (const table of ['npcs', 'companions']) {
    const rows = (content as unknown as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) continue;
    const rec = (rows as { id: string }[]).find((r) => r.id === id);
    if (rec) return contentText(table, rec, id);
  }
  return id;
}

/** The letter `id` as a card, or null when no content letter has that id. */
export function letterCard(
  world: World,
  content: ContentMap,
  id: string,
  flags: Readonly<Record<string, FlagValue>> = world.meta.flags,
): LetterCard | null {
  const delivered = inbox(world, content).find((l) => l.id === id);
  if (delivered) {
    return {
      id,
      sender: delivered.sender,
      seal: delivered.seal,
      subject: delivered.subject,
      paragraphs: delivered.body,
      delivered: true,
    };
  }
  const defs = (content as unknown as { letters?: LetterDefLike[] }).letters ?? [];
  const def = defs.find((d) => d.id === id);
  if (!def) return null;
  const resolve = flagResolver(flags);
  return {
    id,
    sender: def.sender
      ? personName(content, def.sender)
      : contentText('letters', def, def.id, 'senderName'),
    seal: def.seal,
    subject: contentText('letters', def, def.id, 'subject'),
    paragraphs: def.body
      .filter((p) => !p.when || evaluate(p.when, resolve))
      .map((p) => contentRef('letters', def.id, `body.${p.id}.text`)),
    delivered: false,
  };
}

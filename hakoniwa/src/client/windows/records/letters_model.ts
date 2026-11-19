// Implements the model of `ui_win_letters` (ux_and_onboarding.md 6.3.8): the letters received.
// A letter shows its sender, its seal (官印, 教会, 商号, 私人), the day it arrived and the
// paragraphs frozen when it was sent; attachments may be taken into the pack, and the replies
// still open are offered until one is chosen. Sending is not open before the messenger's door
// (`feature.messenger`), so the 寄出 tab is left out until then rather than shown empty (1.6).
// Pure; Node-tested. The painter is ./letters_window.ts.

import { contentRef } from '../../../core/content_key';
import { t } from '../../../shared_ui/i18n';
import type { LetterView } from '../../../systems/records';

export const LETTERS_TABS = ['inbox', 'outbox'] as const;
export type LettersTab = (typeof LETTERS_TABS)[number];

/** The flag that opens sending (ux_and_onboarding.md 24.3). */
export const MESSENGER_FLAG = 'feature.messenger';

export interface LetterAttachmentRow {
  item: string;
  /** "银叶草 x3" */
  label: string;
}

export interface LetterRow {
  id: string;
  sender: string;
  /** the seal as a word */
  seal: string;
  subject: string;
  /** the day it arrived, '' while it names none */
  arrived: string;
  /** the state as a word (已读, 已回信); '' while unread, which the unread mark says */
  state: string;
  body: string[];
  attachments: LetterAttachmentRow[];
  /** the attachments are still in the letter */
  canTake: boolean;
  replies: { id: string; label: string }[];
  /** the reply chosen ('' when none) */
  reply: string;
  unread: boolean;
}

export interface LettersModel {
  tab: LettersTab;
  tabs: { id: LettersTab; label: string; count: number }[];
  rows: LetterRow[];
  /** the letter shown open, or null */
  openId: string | null;
  /** '' when there are letters */
  empty: string;
  /** sending is not open yet: the outbox tab is not offered */
  sendingOpen: boolean;
}

export interface LettersInput {
  inbox: readonly LetterView[];
  tab: LettersTab;
  /** the letter the player has open, if any */
  openId?: string | null;
  /** `feature.messenger` is on */
  sendingOpen: boolean;
  /** an attachment's display name */
  itemName(id: string): string;
}

function attachmentLabel(name: string, count: number): string {
  return count > 1 ? t('ui.win.letters.attachment_n', { name, n: count }) : name;
}

export function lettersModel(i: LettersInput): LettersModel {
  const rows: LetterRow[] = i.inbox.map((l) => ({
    id: l.id,
    sender: t(l.sender),
    seal: t(`ui.win.letters.seal.${l.seal}`),
    subject: t(l.subject),
    arrived: l.delivered !== null ? t('ui.win.letters.arrived', { d: l.delivered }) : '',
    // an unread letter carries the unread badge; writing 未读 again would say it twice
    state: l.state === 'delivered' ? '' : t(`ui.win.letters.state.${l.state}`),
    body: l.body.map((p) => t(p)),
    attachments: l.attachments.map((a) => ({
      item: a.item,
      label: attachmentLabel(i.itemName(a.item), a.count),
    })),
    canTake: l.attachments.length > 0 && !l.taken,
    replies: l.replies.map((r) => ({ id: r.id, label: t(r.label) })),
    // the kernel keeps the chosen reply's id; its label is the letter's own content text
    reply: l.reply
      ? t('ui.win.letters.replied_with', {
          label: contentRef('letters', l.id, `replies.${l.reply}.label`),
        })
      : '',
    unread: l.state === 'delivered',
  }));
  const ids: readonly LettersTab[] = i.sendingOpen ? LETTERS_TABS : ['inbox'];
  const tabs = ids.map((id) => ({
    id,
    label: t(`ui.win.letters.tab.${id}`),
    count: id === 'inbox' ? rows.length : 0,
  }));
  const tab: LettersTab = i.sendingOpen ? i.tab : 'inbox';
  return {
    tab,
    tabs,
    rows,
    openId: i.openId ?? null,
    empty:
      tab === 'inbox'
        ? rows.length === 0
          ? t('ui.win.letters.inbox_empty')
          : ''
        : t('ui.win.letters.outbox_empty'),
    sendingOpen: i.sendingOpen,
  };
}

/** Letters whose arrival the player has not opened yet (the window's unread mark). */
export function unreadCount(rows: readonly LetterRow[]): number {
  return rows.filter((r) => r.unread).length;
}

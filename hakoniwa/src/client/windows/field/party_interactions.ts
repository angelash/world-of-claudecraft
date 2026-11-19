// The party's optional conversations and stance hand-back. Choices stay available only
// while the actual saved exchange waits for a reply, including after restoring a save.

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import {
  banterPanelData,
  banterReplyCommand,
  companionAutoCommand,
  companionInteractionData,
  companionTalkCommand,
} from '../../adapters/interface_closure';
import { actionButton, rebuilder } from '../kit';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';

export function partyInteractions(ctx: WindowContext): WindowContent {
  const root = el('section', { className: 'hk-party-interactions' });
  const update = rebuilder(
    root,
    () => ({
      people: companionInteractionData(ctx.view),
      banter: banterPanelData(ctx.view),
    }),
    (m) => {
      for (const c of m.people) {
        if (!c.walking && !c.resting) continue;
        root.append(
          el('div', { className: 'hk-card' }, [
            el('strong', { text: c.name }),
            c.walking
              ? el('div', { className: 'hk-row' }, [
                  el('span', {
                    className: 'hk-muted',
                    text: t(
                      c.manual
                        ? 'ui.win.party.interaction.manual'
                        : 'ui.win.party.interaction.auto',
                    ),
                  }),
                  actionButton(
                    ctx,
                    t(
                      c.manual
                        ? 'ui.win.party.interaction.hand_back'
                        : 'ui.win.party.interaction.take_control',
                    ),
                    () => companionAutoCommand(c.id, c.manual),
                  ),
                  actionButton(ctx, t('ui.win.party.interaction.camp_talk'), () =>
                    companionTalkCommand(c.id, false),
                  ),
                ])
              : null,
            c.resting
              ? actionButton(ctx, t('ui.win.party.interaction.visit'), () =>
                  companionTalkCommand(c.id, true),
                )
              : null,
          ]),
        );
      }
      const b = m.banter;
      if (!b) return;
      root.append(el('h3', { text: t('ui.win.party.interaction.banter') }));
      if (b.line) root.append(el('p', { text: b.line }));
      if (b.options.length) {
        root.append(
          el('p', {
            className: 'hk-muted',
            text: t('ui.win.party.interaction.reply_left', { t: b.remaining }),
          }),
        );
        root.append(
          el(
            'div',
            { className: 'hk-row', dataset: { hud: 'party_banter_reply' } },
            b.options.map((o) =>
              actionButton(ctx, o.label, () => banterReplyCommand(b.id, o.index)),
            ),
          ),
        );
      }
    },
  );
  return { el: root, update };
}

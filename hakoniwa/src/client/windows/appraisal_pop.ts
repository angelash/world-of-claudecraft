import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { AppraisalCardModel } from './appraisal_model';
import { kv } from './kit';

export function paintAppraisal(root: HTMLElement, m: AppraisalCardModel): void {
  root.append(
    el('strong', { text: m.name }),
    el('div', {
      className: `hk-appraisal-reading${m.vague ? ' vague' : ''}`,
      text: m.reading,
    }),
  );
  if (m.tier) root.append(kv(t('ui.pop.appraisal.tier'), m.tier));
  if (m.potential) root.append(kv(t('ui.pop.charcard.potential'), m.potential));
  if (m.pressure) root.append(el('p', { className: 'hk-muted', text: m.pressure }));
  if (m.note) root.append(el('p', { text: m.note }));
}

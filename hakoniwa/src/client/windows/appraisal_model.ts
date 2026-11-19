// Render a settled appraisal, not a prediction from hidden entity levels. The pageless
// player stays unreadable even when an older or malformed record includes extra fields.

import { t } from '../../shared_ui/i18n';
import type { AppraisalResult } from '../../systems/cognition';

export interface AppraisalCardInput {
  result: AppraisalResult;
  name: string;
  self: boolean;
  talent: boolean;
  pressure: string;
}

export interface AppraisalCardModel {
  name: string;
  reading: string;
  tier: string;
  potential: string;
  note: string;
  pressure: string;
  vague: boolean;
}

export function appraisalCardModel(i: AppraisalCardInput): AppraisalCardModel {
  const exact = !i.self && (i.result.kind === 'exact' || i.result.kind === 'fragment');
  return {
    name: i.name,
    reading: i.self ? t('sys.cognition.appraise.no_record') : t(i.result.display),
    tier: exact && i.result.tierName ? t(i.result.tierName) : '',
    potential: !i.self && i.talent && i.result.potential ? i.result.potential : '',
    note:
      i.self && i.result.kind !== 'no_record'
        ? t('sys.cognition.appraise.note.no_reaction', {
            device: t(`sys.cognition.device.${i.result.device}`),
          })
        : t(i.result.note),
    pressure: i.pressure,
    vague:
      !i.self &&
      (i.result.kind === 'unknown' || i.result.kind === 'capped' || i.result.kind === 'band'),
  };
}

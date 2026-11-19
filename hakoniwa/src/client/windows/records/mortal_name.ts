// The naming ledger's mortal rule for display names (D-030; reveal_ledger.md 6;
// ux_and_onboarding.md 5.3 and 6.3.2): until the player hears the word from Yeyu
// (`term.dian_known`), the interface says the mortal word wherever the canon one would show.
// A name built on the canon term (a monster called after it, a nest, a crystal) has the term
// replaced by the mortal word, so no window gives the word away early. The two words are text
// keys, so the rule follows the interface language. Pure; Node-tested. Shared by the record
// and field windows.

import { t } from '../../../shared_ui/i18n';

/** The canon term and the mortal word in the active language. */
export function termPair(): { canon: string; mortal: string } {
  return { canon: t('ui.common.term.dian'), mortal: t('ui.common.term.dian_mortal') };
}

/**
 * A display name under the mortal rule: unchanged once the word is known, otherwise every
 * occurrence of the canon term is replaced by the mortal word.
 */
export function mortalName(name: string, dianKnown: boolean): string {
  if (dianKnown || name === '') return name;
  const { canon, mortal } = termPair();
  if (!canon || canon === mortal || !name.includes(canon)) return name;
  return name.split(canon).join(mortal);
}

import type { TranslationKey } from './i18n';

const SINGULARITY_ALIAS_KEYS: Record<string, TranslationKey> = {
  foodFixated: 'hudChrome.aiSpeech.singularityAliasFoodFixated',
  collector: 'hudChrome.aiSpeech.singularityAliasCollector',
  omenSensitive: 'hudChrome.aiSpeech.singularityAliasOmenSensitive',
  cowardly: 'hudChrome.aiSpeech.singularityAliasCowardly',
  territorial: 'hudChrome.aiSpeech.singularityAliasTerritorial',
  vengeful: 'hudChrome.aiSpeech.singularityAliasVengeful',
  stargazer: 'hudChrome.aiSpeech.singularityAliasStargazer',
  singularity: 'hudChrome.aiSpeech.singularityAliasDefault',
};

export function singularityAliasTranslationKey(alias: string): TranslationKey | null {
  return SINGULARITY_ALIAS_KEYS[alias] ?? null;
}

import { describe, expect, it } from 'vitest';
import { singularityAliasTranslationKey } from '../src/ui/ai_speech_name';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';

describe('AI speech speaker names', () => {
  it('maps singularity alias tokens to HUD chrome translation keys', () => {
    const aiSpeechStrings = hudChromeStrings.aiSpeech as Record<string, string>;
    const aliases = [
      'foodFixated',
      'collector',
      'omenSensitive',
      'cowardly',
      'territorial',
      'vengeful',
      'stargazer',
      'singularity',
    ];

    for (const alias of aliases) {
      const key = singularityAliasTranslationKey(alias);
      expect(key, alias).toMatch(/^hudChrome\.aiSpeech\.singularityAlias/);
      expect(aiSpeechStrings[key!.slice('hudChrome.aiSpeech.'.length)]).toContain('{baseName}');
    }
    expect(singularityAliasTranslationKey('ordinary')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { dynamicSpeechPromptRules, polishDynamicSpeechText } from '../server/ai/speech_style';

describe('AI speech style', () => {
  it('adds natural spoken guidance for Chinese dynamic speech prompts', () => {
    const rules = dynamicSpeechPromptRules('zh_CN').join('\n');

    expect(rules).toContain('one breath, one image, one reaction');
    expect(rules).toContain('Do not start with 不过');
    expect(rules).toContain('Do not use 你问的是, 我建议');
  });

  it('adds natural spoken guidance for English dynamic speech prompts', () => {
    const rules = dynamicSpeechPromptRules('en').join('\n');

    expect(rules).toContain('spoken contractions');
    expect(rules).toContain('avoid colon-led setup');
  });

  it('polishes assistant-like English phrasing into a shorter spoken line', () => {
    const text = polishDynamicSpeechText(
      "However, to answer your question: I am keeping an eye on the road; it is too quiet tonight.",
      'en',
    );

    expect(text).toBe("I'm keeping an eye on the road, it's too quiet tonight.");
  });

  it('drops Chinese Q-and-A framing and colon-heavy cadence', () => {
    const text = polishDynamicSpeechText(
      '不过，我建议你看这边：风里有土腥味，今晚不太安生。',
      'zh_CN',
    );

    expect(text).toBe('风里有土腥味，今晚不太安生。');
  });

  it('removes explicit assistant identity from English speech', () => {
    const text = polishDynamicSpeechText(
      'As an AI, I would recommend you stay close to the torchlight.',
      'en',
    );

    expect(text).toBe("Stay close to the torchlight.");
  });
});

import { describe, expect, it } from 'vitest';
import { dynamicSpeechPromptRules, polishDynamicSpeechText } from '../server/ai/speech_style';

describe('AI speech style', () => {
  it('adds natural spoken guidance for Chinese dynamic speech prompts', () => {
    const rules = dynamicSpeechPromptRules('zh_CN').join('\n');

    expect(rules).toContain('one breath, one image, one reaction');
    expect(rules).toContain('Do not start with 首先, 其次, 最后, 不过');
    expect(rules).toContain('Do not use 你问的是, 如果你要问, 真要说, 先说一句, 我建议你');
    expect(rules).toContain('Assistant-like habits to avoid: connector-first openings, question restatement scaffolding');
    expect(rules).toContain('不要只写“闻到了吗？”');
    expect(rules).toContain('某某开口前');
  });

  it('adds natural spoken guidance for English dynamic speech prompts', () => {
    const rules = dynamicSpeechPromptRules('en').join('\n');

    expect(rules).toContain('spoken contractions');
    expect(rules).toContain('avoid colon-led setup');
    expect(rules).toContain('honestly, firstly, secondly');
    expect(rules).toContain('question restatement scaffolding');
    expect(rules).toContain('Do not say vague prompts like "Smell that?"');
    expect(rules).toContain('Brother Aldric glances at the sky');
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

  it('drops fingerprint-specific avoided phrases from English speech', () => {
    const text = polishDynamicSpeechText(
      'This means the graves are listening tonight.',
      'en',
      {
        sentenceRhythm: 'soft',
        addressStyle: 'sparing',
        favoriteStarts: ['Keep your voice low'],
        sensoryBias: ['cold air'],
        avoidedPhrases: ['this means'],
      },
    );

    expect(text).toBe('The graves are listening tonight.');
  });

  it('strips extra Chinese scaffolding before keeping the spoken image', () => {
    const text = polishDynamicSpeechText(
      '其实，重点是，风里有铁锈味，像有人刚动过锁。',
      'zh_CN',
    );

    expect(text).toBe('风里有铁锈味，像有人刚动过锁。');
  });

  it('strips layered Chinese answer scaffolding and essay-like openers', () => {
    const text = polishDynamicSpeechText(
      '首先，真要说，先说一句，风把灰吹进门缝了。',
      'zh_CN',
    );

    expect(text).toBe('风把灰吹进门缝了。');
  });

  it('strips third-person Chinese action narration down to the bare emote fragment', () => {
    const text = polishDynamicSpeechText(
      'Brother Aldric开口前偷偷瞥了一眼星空。',
      'zh_CN',
    );

    expect(text).toBe('偷偷瞥了一眼星空。');
  });

  it('strips layered English answer scaffolding before the actual spoken line', () => {
    const text = polishDynamicSpeechText(
      "To answer your question, the short version is: the rain's back on the shutters.",
      'en',
    );

    expect(text).toBe("The rain's back on the shutters.");
  });
});

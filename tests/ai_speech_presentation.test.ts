import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types';
import { aiSpeechPresentationView, splitAiNarrationText } from '../src/ui/ai_reaction';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
type DynamicAiSpeechEvent = AiSpeechEvent & {
  speech: Extract<AiSpeechEvent['speech'], { mode: 'dynamicText' }>;
};
type LineIdAiSpeechEvent = AiSpeechEvent & {
  speech: Extract<AiSpeechEvent['speech'], { mode: 'lineId' }>;
};

function dynamicSpeech(text: string, language: string): DynamicAiSpeechEvent {
  return {
    type: 'aiSpeech',
    speakerId: 7,
    speakerName: 'Brother Aldric',
    speech: { mode: 'dynamicText', language, text },
    source: 'codex',
  };
}

describe('AI speech presentation', () => {
  it('routes action-like Chinese dynamic text through the emote template', () => {
    const ev = dynamicSpeech('Brother Aldric开口前偷偷瞥了一眼星空。', 'zh_CN');

    expect(aiSpeechPresentationView(ev, ev.speech.text, ev.speakerName)).toEqual({
      channel: 'emote',
      logMode: 'inlineNarration',
      templateKey: 'hud.chat.templates.emote',
      text: 'Brother Aldric开口前偷偷瞥了一眼星空。',
      bubbleText: '偷偷瞥了一眼星空。',
    });
  });

  it('keeps ordinary dynamic speech in the say channel', () => {
    const ev = dynamicSpeech('钟声快响了，别在墓路上久站。', 'zh_CN');

    expect(aiSpeechPresentationView(ev, ev.speech.text, ev.speakerName)).toEqual({
      channel: 'say',
      logMode: 'template',
      templateKey: 'hud.chat.templates.say',
      text: '钟声快响了，别在墓路上久站。',
      bubbleText: '钟声快响了，别在墓路上久站。',
    });
  });

  it('routes pronoun-led English dynamic text through the emote template', () => {
    const ev = dynamicSpeech('He glances at the chapel roof', 'en');

    expect(aiSpeechPresentationView(ev, ev.speech.text, ev.speakerName)).toEqual({
      channel: 'emote',
      logMode: 'template',
      templateKey: 'hud.chat.templates.emote',
      text: 'Glances at the chapel roof.',
      bubbleText: 'Glances at the chapel roof.',
    });
  });

  it('routes fixed narrative lines away from the say template', () => {
    const ev: LineIdAiSpeechEvent = {
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: '森林狼',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.genericNpcAwake' },
      source: 'local',
    };

    expect(aiSpeechPresentationView(ev, '森林狼打量着道路，随后带着新的注意力转向你。', ev.speakerName)).toEqual({
      channel: 'emote',
      logMode: 'inlineNarration',
      templateKey: 'hud.chat.templates.emote',
      text: '森林狼打量着道路，随后带着新的注意力转向你。',
      bubbleText: '打量着道路，随后带着新的注意力转向你。',
    });
  });

  it('keeps explicitly spoken fixed lines in the say channel', () => {
    const ev: LineIdAiSpeechEvent = {
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' },
      source: 'local',
    };

    expect(aiSpeechPresentationView(ev, 'The dead are restless tonight. Keep your journal close, Arthur.', ev.speakerName)).toEqual({
      channel: 'say',
      logMode: 'template',
      templateKey: 'hud.chat.templates.say',
      text: 'The dead are restless tonight. Keep your journal close, Arthur.',
      bubbleText: 'The dead are restless tonight. Keep your journal close, Arthur.',
    });
  });

  it('strips embedded speaker references from narration bubbles without altering the log text', () => {
    const ev: LineIdAiSpeechEvent = {
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.sceneRainWeariness' },
      source: 'local',
    };

    expect(aiSpeechPresentationView(ev, "Rain beads on Brother Aldric's shoulders; the answer comes shorter than usual.", ev.speakerName)).toEqual({
      channel: 'emote',
      logMode: 'inlineNarration',
      templateKey: 'hud.chat.templates.emote',
      text: "Rain beads on Brother Aldric's shoulders; the answer comes shorter than usual.",
      bubbleText: 'Rain beads on shoulders; the answer comes shorter than usual.',
    });
  });
});

describe('AI narration text splitting', () => {
  it('reuses the first in-text speaker mention as the clickable speaker token', () => {
    expect(splitAiNarrationText("Rain beads on Brother Aldric's shoulders.", 'Brother Aldric')).toEqual({
      before: 'Rain beads on ',
      speaker: 'Brother Aldric',
      after: "'s shoulders.",
    });
  });
});

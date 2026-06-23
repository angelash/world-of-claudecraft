import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types';
import { aiSpeechPresentationView } from '../src/ui/ai_reaction';

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
      templateKey: 'hud.chat.templates.emote',
      text: '偷偷瞥了一眼星空。',
      bubbleText: '偷偷瞥了一眼星空。',
    });
  });

  it('keeps ordinary dynamic speech in the say channel', () => {
    const ev = dynamicSpeech('钟声快响了，别在墓路上久站。', 'zh_CN');

    expect(aiSpeechPresentationView(ev, ev.speech.text, ev.speakerName)).toEqual({
      channel: 'say',
      templateKey: 'hud.chat.templates.say',
      text: '钟声快响了，别在墓路上久站。',
      bubbleText: '钟声快响了，别在墓路上久站。',
    });
  });

  it('routes action-like English dynamic text through the emote template', () => {
    const ev = dynamicSpeech('Brother Aldric glances at the chapel roof', 'en');

    expect(aiSpeechPresentationView(ev, ev.speech.text, ev.speakerName)).toEqual({
      channel: 'emote',
      templateKey: 'hud.chat.templates.emote',
      text: 'Glances at the chapel roof.',
      bubbleText: 'Glances at the chapel roof.',
    });
  });

  it('keeps fixed line-id speech in the say channel even when the resolved text looks physical', () => {
    const ev: LineIdAiSpeechEvent = {
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' },
      source: 'local',
    };

    expect(aiSpeechPresentationView(ev, 'Glances at the chapel roof.', ev.speakerName)).toEqual({
      channel: 'say',
      templateKey: 'hud.chat.templates.say',
      text: 'Glances at the chapel roof.',
      bubbleText: 'Glances at the chapel roof.',
    });
  });
});

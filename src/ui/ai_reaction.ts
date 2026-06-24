import type { SimEvent } from '../sim/types';
import type { TranslationKey } from './i18n';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
export type AiReactionKind = NonNullable<AiSpeechEvent['reaction']>['kind'];
export type VisibleAiReactionKind = Exclude<AiReactionKind, 'ignore'>;

export interface AiReactionBadgeView {
  kind: VisibleAiReactionKind;
  labelKey: TranslationKey;
  targetEntityId?: number;
  targetPos?: { x: number; z: number };
  planned?: true;
  planKind?: string;
  durationMs?: number;
  actionOffset?: number;
}

export interface AiSpeechPresentationView {
  channel: 'say' | 'emote';
  logMode: 'template' | 'inlineNarration';
  templateKey: TranslationKey;
  text: string;
  bubbleText: string;
}

const BADGE_KEYS: Record<VisibleAiReactionKind, TranslationKey> = {
  approach: 'hudChrome.aiReaction.approach',
  avoid: 'hudChrome.aiReaction.avoid',
  inspect: 'hudChrome.aiReaction.inspect',
};

const PLAN_BADGE_KEYS: Record<string, TranslationKey> = {
  eating: 'hud.core.eating',
  shelter: 'hudChrome.aiReaction.avoid',
  sleeping: 'hudChrome.rest.resting',
  watching: 'hudChrome.aiReaction.inspect',
  working: 'hudChrome.aiReaction.inspect',
};

const ZH_EMOTE_START = /^(?:开口前|说话前|出声前|答话前|回话前|偷偷|悄悄|默默|轻轻|缓缓|抬头|低头|偏头|侧耳|缩了缩|耸耸肩|点点头|摇摇头|瞥了一眼|瞥了眼|看了看|打量着|打量了下|闻了闻|嗅了嗅|盯着|后退半步|退了半步|向前一步|靠近了些|沉默了片刻|顿了顿)/;
const ZH_EMOTE_VERB = /(?:瞥|抬头|低头|偏头|侧耳|缩|耸肩|点头|摇头|看了看|打量|闻|嗅|盯|后退|靠近|沉默|顿)/;
const EN_EMOTE_START = /^(?:before speaking|before he speaks|before she speaks|without a word|instead of answering)\b/i;
const EN_EMOTE_VERB = /^(?:glances|nods|shakes\s+his\s+head|shakes\s+her\s+head|stiffens|pauses|leans\s+(?:closer|in|forward)|sniffs|tilts\s+(?:his|her|its)\s+head|squints|steps\s+(?:back|closer|forward)|backs\s+away|flinches|hesitates|looks\s+(?:up|down|over|aside|away|at|toward|towards))\b/i;
const FIXED_SAY_LINE_IDS = new Set<string>([
  'hudChrome.aiSpeech.brotherAldricAwake',
  'hudChrome.aiSpeech.merchantMarketPulse',
]);

export function aiReactionBadgeView(reaction: AiSpeechEvent['reaction']): AiReactionBadgeView | null {
  if (!reaction || reaction.kind === 'ignore') return null;
  const targetEntityId = typeof reaction.targetEntityId === 'number'
    ? reaction.targetEntityId
    : typeof reaction.targetObjectId === 'number'
      ? reaction.targetObjectId
      : undefined;
  const planIntensity = typeof reaction.planIntensity === 'number'
    ? Math.max(0, Math.min(1, reaction.planIntensity))
    : 0;
  const planKind = typeof reaction.planKind === 'string' && reaction.planKind.length > 0 ? reaction.planKind : undefined;
  const targetPos = reaction.targetPos
    && Number.isFinite(reaction.targetPos.x)
    && Number.isFinite(reaction.targetPos.z)
    ? { x: reaction.targetPos.x, z: reaction.targetPos.z }
    : undefined;
  const actionDurationMs = typeof reaction.actionDurationMs === 'number'
    ? Math.max(700, Math.min(6000, Math.round(reaction.actionDurationMs)))
    : undefined;
  const actionOffset = typeof reaction.actionOffset === 'number'
    ? Math.max(0.04, Math.min(1.2, reaction.actionOffset))
    : undefined;
  const planned = planKind !== undefined || planIntensity > 0;
  const base: AiReactionBadgeView = {
    kind: reaction.kind,
    labelKey: planKind ? PLAN_BADGE_KEYS[planKind] ?? BADGE_KEYS[reaction.kind] : BADGE_KEYS[reaction.kind],
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
    ...(targetPos === undefined ? {} : { targetPos }),
  };
  return planned
    ? {
        ...base,
        planned: true,
        ...(planKind ? { planKind } : {}),
        durationMs: actionDurationMs ?? Math.round(2_100 + planIntensity * 1_100),
        ...(actionOffset === undefined ? {} : { actionOffset }),
      }
    : {
        ...base,
        ...(actionDurationMs === undefined ? {} : { durationMs: actionDurationMs }),
        ...(actionOffset === undefined ? {} : { actionOffset }),
      };
}

export function aiSpeechPresentationView(
  ev: AiSpeechEvent,
  resolvedText: string,
  speakerName: string,
): AiSpeechPresentationView {
  const trimmed = resolvedText.trim();
  if (ev.speech.mode !== 'dynamicText') {
    return FIXED_SAY_LINE_IDS.has(ev.speech.lineId)
      ? sayPresentation(trimmed)
      : narrationPresentation(trimmed, speakerName);
  }
  const dynamicEmoteText = looksLikeDynamicEmote(trimmed, ev.speech.language, speakerName)
    ? normalizeDynamicEmoteText(trimmed, ev.speech.language, speakerName)
    : '';
  if (containsSpeakerReference(trimmed, speakerName)) {
    return narrationPresentation(trimmed, speakerName, dynamicEmoteText || undefined);
  }
  if (!dynamicEmoteText) return sayPresentation(trimmed);
  const emoteText = dynamicEmoteText;
  return emoteText ? emotePresentation(emoteText) : sayPresentation(trimmed);
}

function looksLikeDynamicEmote(text: string, locale: string, speakerName: string): boolean {
  const normalized = stripLeadingSpeakerReference(text, speakerName, locale);
  if (!normalized) return false;
  if (isChineseLocale(locale)) {
    if (ZH_EMOTE_START.test(normalized)) return true;
    return /^(?:他|她|它)/.test(normalized) && ZH_EMOTE_VERB.test(normalized);
  }
  if (isEnglishLocale(locale)) {
    if (EN_EMOTE_START.test(normalized)) return true;
    if (EN_EMOTE_VERB.test(normalized)) return true;
    return /^(?:he|she|it|they)\s+(?=(?:glances|nods|shakes|stiffens|pauses|leans|sniffs|tilts|squints|steps|backs|flinches|hesitates|looks)\b)/i.test(normalized);
  }
  return false;
}

function normalizeDynamicEmoteText(text: string, locale: string, speakerName: string): string {
  const stripped = stripLeadingSpeakerReference(text, speakerName, locale);
  if (!stripped) return stripped;
  if (isChineseLocale(locale)) return normalizeChineseEmoteText(stripped);
  if (isEnglishLocale(locale)) return normalizeEnglishEmoteText(stripped);
  return stripped;
}

export function splitAiNarrationText(text: string, speakerName: string): {
  before: string;
  speaker: string | null;
  after: string;
} {
  const name = speakerName.trim();
  if (!name) return { before: '', speaker: null, after: text };
  const idx = text.indexOf(name);
  if (idx < 0) return { before: '', speaker: null, after: text };
  return {
    before: text.slice(0, idx),
    speaker: text.slice(idx, idx + name.length),
    after: text.slice(idx + name.length),
  };
}

function normalizeChineseEmoteText(text: string): string {
  let out = text.trim();
  out = out.replace(/^(?:开口前|说话前|出声前|答话前|回话前)[，,、\s]*/, '');
  out = out.replace(/^(?:他|她|它)(?=(?:偷偷|悄悄|默默|轻轻|缓缓|抬头|低头|偏头|侧耳|缩了缩|耸耸肩|点点头|摇摇头|瞥了一眼|瞥了眼|看了看|打量着|打量了下|闻了闻|嗅了嗅|盯着|后退半步|退了半步|向前一步|靠近了些|沉默了片刻|顿了顿))/, '');
  out = out.replace(/^[，,、。！？!?：:\s]+/, '').trim();
  if (out && !/[。！？!?]$/.test(out)) out += '。';
  return out;
}

function normalizeEnglishEmoteText(text: string): string {
  let out = text.trim();
  out = out.replace(EN_EMOTE_START, '');
  out = out.replace(/^(?:he|she|it|they)\s+/i, '');
  out = out.replace(/^[,;:\s-]+/, '').trim();
  if (!out) return out;
  out = out[0].toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}

function stripLeadingSpeakerReference(text: string, speakerName: string, locale: string): string {
  const trimmed = text.trim();
  const name = speakerName.trim();
  if (!name) return trimmed;
  const escaped = escapeRegExp(name);
  if (isChineseLocale(locale)) {
    return trimmed.replace(new RegExp(`^${escaped}(?:的)?[：:,，\\s-]*`, 'i'), '').trim();
  }
  if (isEnglishLocale(locale)) {
    return trimmed.replace(new RegExp(`^${escaped}(?:'s)?[,;:，\\s-]*`, 'i'), '').trim();
  }
  return trimmed.replace(new RegExp(`^${escaped}[：:,，\\s-]*`, 'i'), '').trim();
}

function containsSpeakerReference(text: string, speakerName: string): boolean {
  const name = speakerName.trim();
  return !!name && text.includes(name);
}

function normalizeNarrationBubbleText(text: string, speakerName: string): string {
  const trimmed = text.trim();
  const name = speakerName.trim();
  if (!name) return trimmed;
  const escaped = escapeRegExp(name);
  let out = trimmed
    .replace(new RegExp(`${escaped}的`, 'g'), '')
    .replace(new RegExp(`${escaped}'s`, 'gi'), '')
    .replace(new RegExp(escaped, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，,、。！？!?：:;'"\s-]+/, '')
    .trim();
  if (!out) return trimmed;
  if (/^[a-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

function sayPresentation(text: string): AiSpeechPresentationView {
  return {
    channel: 'say',
    logMode: 'template',
    templateKey: 'hud.chat.templates.say',
    text,
    bubbleText: text,
  };
}

function emotePresentation(text: string): AiSpeechPresentationView {
  return {
    channel: 'emote',
    logMode: 'template',
    templateKey: 'hud.chat.templates.emote',
    text,
    bubbleText: text,
  };
}

function narrationPresentation(text: string, speakerName: string, bubbleText?: string): AiSpeechPresentationView {
  return {
    channel: 'emote',
    logMode: 'inlineNarration',
    templateKey: 'hud.chat.templates.emote',
    text,
    bubbleText: bubbleText ?? normalizeNarrationBubbleText(text, speakerName),
  };
}

function isChineseLocale(locale: string): boolean {
  return locale === 'zh_CN' || locale === 'zh_TW' || locale.toLowerCase().startsWith('zh');
}

function isEnglishLocale(locale: string): boolean {
  return locale === 'en' || locale === 'en_CA' || locale.toLowerCase().startsWith('en');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

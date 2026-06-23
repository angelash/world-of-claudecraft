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
    return {
      channel: 'say',
      templateKey: 'hud.chat.templates.say',
      text: trimmed,
      bubbleText: trimmed,
    };
  }
  if (!looksLikeDynamicEmote(trimmed, ev.speech.language, speakerName)) {
    return {
      channel: 'say',
      templateKey: 'hud.chat.templates.say',
      text: trimmed,
      bubbleText: trimmed,
    };
  }
  const emoteText = normalizeDynamicEmoteText(trimmed, ev.speech.language, speakerName);
  if (!emoteText) {
    return {
      channel: 'say',
      templateKey: 'hud.chat.templates.say',
      text: trimmed,
      bubbleText: trimmed,
    };
  }
  return {
    channel: 'emote',
    templateKey: 'hud.chat.templates.emote',
    text: emoteText,
    bubbleText: emoteText,
  };
}

function looksLikeDynamicEmote(text: string, locale: string, speakerName: string): boolean {
  const normalized = stripLeadingSpeakerName(text, speakerName);
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
  const stripped = stripLeadingSpeakerName(text, speakerName);
  if (!stripped) return stripped;
  if (isChineseLocale(locale)) return normalizeChineseEmoteText(stripped);
  if (isEnglishLocale(locale)) return normalizeEnglishEmoteText(stripped);
  return stripped;
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

function stripLeadingSpeakerName(text: string, speakerName: string): string {
  const trimmed = text.trim();
  const name = speakerName.trim();
  if (!name) return trimmed;
  return trimmed.replace(new RegExp(`^${escapeRegExp(name)}[：:,，\\s-]*`, 'i'), '').trim();
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

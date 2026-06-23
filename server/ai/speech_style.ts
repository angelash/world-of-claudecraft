import type { AiSpeechFingerprint } from './ai_types';

interface DynamicSpeechPolishResult {
  text: string;
  before: string;
  beforeChars: number;
  afterChars: number;
  changed: boolean;
  charsTrimmed: number;
}

const ZH_LEADING_TRANSITIONS = [
  '首先',
  '其次',
  '最后',
  '不过',
  '但是',
  '然而',
  '其实',
  '而且',
  '另外',
  '此外',
  '同时',
  '因此',
  '所以',
  '总之',
  '归根结底',
  '说到底',
  '到头来',
  '具体来说',
  '比如说',
  '先说一句',
  '真要说',
  '问题是',
  '重点是',
  '总的来说',
  '需要注意的是',
  '值得一提的是',
  '简单来说',
  '换句话说',
  '从这个角度看',
] as const;

const EN_LEADING_TRANSITIONS = [
  'firstly',
  'secondly',
  'however',
  'also',
  'additionally',
  'furthermore',
  'basically',
  'frankly',
  'more specifically',
  'therefore',
  'overall',
  'in short',
  'that said',
  'the short version is',
  'long story short',
  'at the end of the day',
  'in conclusion',
  'to summarize',
] as const;

const ZH_ACTION_LEADS = [
  '开口前',
  '说话前',
  '出声前',
  '答话前',
  '回话前',
  '偷偷',
  '悄悄',
  '默默',
  '轻轻',
  '缓缓',
  '抬头',
  '低头',
  '偏头',
  '侧耳',
  '缩了缩',
  '耸耸肩',
  '点点头',
  '摇摇头',
  '瞥了一眼',
  '瞥了眼',
  '看了看',
  '打量着',
  '打量了下',
  '闻了闻',
  '嗅了嗅',
  '盯着',
  '后退半步',
  '退了半步',
  '向前一步',
  '靠近了些',
  '沉默了片刻',
  '顿了顿',
] as const;

const EN_ACTION_START = /^(?:before speaking|before he speaks|before she speaks|without a word|instead of answering)\b/i;

export function dynamicSpeechPromptRules(locale: string): string[] {
  const common = [
    '- DynamicText is one short spoken line, not an explanation. Aim for one sentence.',
    '- Sound like the entity is talking in the moment: concrete, sensory, a little incomplete.',
    '- Prefer something a person could blurt while working, watching, walking, or hiding, not narration written for the player.',
    '- Do not write third-person narration of the speaker such as "Brother Aldric glances at the sky" or "Brother Aldric开口前...".',
    '- If the moment is mostly a visible action, output only the bare action fragment with no speaker name and no "before speaking" setup, so the client can present it as an emote.',
    '- Restating the player question, your reasoning, or the whole situation usually makes the line worse.',
    '- Avoid assistant-style transitions, summaries, and lesson-like phrasing.',
    '- Assistant-like habits to avoid: connector-first openings, question restatement scaffolding, advice framing, abstract takeaway lines, and narrated "before speaking" setup.',
    '- Start with the actual line, not a connective, setup clause, or summary preamble.',
    '- Do not echo the topic with frames like "you asked about..." or "你问的是...".',
    '- Do not use advice scaffolding like "I would recommend..." or "我建议你..." unless the character truly talks that way in this moment.',
    '- Do not tidy the line into a neat takeaway such as "this means..." or "这说明...".',
    '- Do not start with however, also, therefore, overall, or similar connector words.',
    '- If the line reacts to a smell, sound, sight, or feeling, name the concrete thing: smoke, wet stone, coins, footsteps, torch oil. Do not say vague prompts like "Smell that?" or "Hear that?"',
    '- One mutter, fragment, or half-finished warning is fine if it sounds alive.',
  ];
  if (isChineseLocale(locale)) {
    return [
      ...common,
      '- For Chinese dynamicText, use natural spoken Chinese. Prefer 8-28 Chinese characters when possible.',
      '- Prefer one breath, one image, one reaction. Avoid textbook wording or tidy explanation structure.',
      '- Do not narrate the speaker with leads like "某某开口前" or "他偷偷瞥了一眼". If the beat is action-heavy, return only the action fragment itself.',
      '- Do not start with 首先, 其次, 最后, 不过, 但是, 然而, 其实, 另外, 此外, 同时, 所以, 因此, 总之, 具体来说, 需要注意的是, or 值得一提的是.',
      '- Do not use 你问的是, 如果你要问, 真要说, 先说一句, 我建议你, 照我看, 从...来看, 这说明, 这意味着, 重点是, or other Q-and-A assistant wording.',
      '- Do not default to neat balanced essay patterns like “一方面……另一方面……” or “不是……而是……”, unless the character truly sounds like that.',
      '- 如果写闻到、听到、看到、觉得，要说具体东西，例如烟味、湿石头、铜钱声、脚步声、灯油味。不要只写“闻到了吗？”、“你听见了吗？”这种空泛问句。',
    ];
  }
  return [
    ...common,
    '- For English dynamicText, prefer 6-18 words when possible.',
    '- Prefer spoken contractions when natural, and avoid colon-led setup or list-like explanation.',
    '- Do not narrate the speaker with leads like "Before speaking" or "he glances at the road". If the beat is action-heavy, return only the action fragment itself.',
    '- Avoid openers like honestly, firstly, secondly, the point is, to answer your question, the short version is, or at the end of the day when they only add scaffolding.',
    '- Avoid connector-first or takeaway-heavy openers like however, more specifically, overall, this means, or that tells me.',
  ];
}

export function polishDynamicSpeechText(text: string, locale: string, fingerprint?: AiSpeechFingerprint | null): string {
  return polishDynamicSpeech(text, locale, fingerprint).text;
}

export function polishDynamicSpeech(text: string, locale: string, fingerprint?: AiSpeechFingerprint | null): DynamicSpeechPolishResult {
  const normalized = stripOuterQuotes(text.replace(/[ \t\r\n]+/g, ' ').trim());
  if (!normalized) {
    return { text: normalized, before: normalized, beforeChars: 0, afterChars: 0, changed: false, charsTrimmed: 0 };
  }
  const withoutSpeaker = stripSpeakerPrefix(normalized);
  const before = withoutSpeaker.trim() || normalized;
  const polished = isChineseLocale(locale)
    ? polishChineseSpeech(withoutSpeaker, normalized, fingerprint)
    : isEnglishLocale(locale)
      ? polishEnglishSpeech(withoutSpeaker, normalized, fingerprint)
      : shortenSpokenLine(withoutSpeaker, normalized);
  const after = polished.trim() || normalized;
  return {
    text: after,
    before,
    beforeChars: before.length,
    afterChars: after.length,
    changed: after !== before,
    charsTrimmed: Math.max(0, before.length - after.length),
  };
}

function isChineseLocale(locale: string): boolean {
  return locale === 'zh_CN' || locale === 'zh_TW' || locale.toLowerCase().startsWith('zh');
}

function isEnglishLocale(locale: string): boolean {
  return locale === 'en' || locale === 'en_CA' || locale.toLowerCase().startsWith('en');
}

function stripChineseTransitions(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 2; pass++) {
    const before = out;
    for (const word of ZH_LEADING_TRANSITIONS) {
      out = out.replace(new RegExp(`^${escapeRegExp(word)}[，,、\\s]*`), '');
      out = out.replace(new RegExp(`([。！？!?])\\s*${escapeRegExp(word)}[，,、\\s]*`, 'g'), '$1');
      out = out.replace(new RegExp(`[，,、]\\s*${escapeRegExp(word)}[，,、\\s]*`, 'g'), '，');
    }
    if (out === before) break;
  }
  return out.trim() || text.trim();
}

function polishChineseSpeech(text: string, fallback: string, fingerprint?: AiSpeechFingerprint | null): string {
  let out = stripChineseTransitions(text);
  out = stripChineseAssistantPhrases(out);
  out = stripChineseActionNarration(out);
  out = stripFingerprintAvoidedPhrases(out, fingerprint);
  out = stripChineseTransitions(out);
  out = relaxChineseCadence(out);
  out = shortenChineseLine(out);
  return cleanupChinesePunctuation(out) || fallback.trim();
}

function stripChineseAssistantPhrases(text: string): string {
  let out = text.trim();
  const patterns = [
    /^你(?:刚才|现在)?(?:问|想问|要问)的(?:是|这个)?[，,：:\s]*/,
    /^你(?:要是|如果)问(?:的是|起)?[^。！？!?，,]{0,24}[，,：:\s]*/,
    /^(?:首先|其次|最后)[，,：:\s]*/,
    /^(?:如果你真要问|如果你要问|真要说|先说一句|要紧的是|问题是|重点是|归根结底|说到底|到头来|换句话说|具体来说|比如说)[，,：:\s]*/,
    /^我(?:会)?建议(?:你)?(?:看(?:这边|这里|那边|那儿|这儿)|听我说|先听我说|先看|留神|小心点)?[，,：:\s]*/,
    /^我的建议是[，,：:\s]*/,
    /^我(?:能说|能看出来|看得出|只知道)[，,：:\s]*/,
    /^照我看[，,：:\s]*/,
    /^我(?:认为|觉得)你(?:可以|应该)[，,：:\s]*/,
    /^从[^。！？!?，,]{1,28}(?:来看|看起来|判断)[，,：:\s]*/,
    /^这(?:说明|意味着|表示|告诉我)(?:着|了)?[，,：:\s]*/,
    /^作为[^，,。！？!?]{0,16}[，,：:\s]*/,
    /^(?:其实|说实话|老实说|真要说|要我说|你要说|重点是|问题是|我想说的是|你得知道)[，,：:\s]*/,
  ];
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const pattern of patterns) out = out.replace(pattern, '');
    if (out === before) break;
  }
  return out.trim() || text.trim();
}

function stripChineseActionNarration(text: string): string {
  let out = text.trim();
  if (!out) return out;
  const leadGroup = ZH_ACTION_LEADS.map(escapeRegExp).join('|');
  out = out.replace(new RegExp(`^[\\u4e00-\\u9fffA-Za-z0-9' -]{2,32}?(?=(?:${leadGroup}))`), '');
  out = out.replace(/^(?:开口前|说话前|出声前|答话前|回话前)[，,、\s]*/, '');
  out = out.replace(/^(?:他|她|它)(?=(?:偷偷|悄悄|默默|轻轻|缓缓|抬头|低头|偏头|侧耳|缩了缩|耸耸肩|点点头|摇摇头|瞥了一眼|瞥了眼|看了看|打量着|打量了下|闻了闻|嗅了嗅|盯着|后退半步|退了半步|向前一步|靠近了些|沉默了片刻|顿了顿))/, '');
  return out.trim() || text.trim();
}

function stripEnglishTransitions(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 2; pass++) {
    const before = out;
    for (const word of EN_LEADING_TRANSITIONS) {
      out = out.replace(new RegExp(`^${escapeRegExp(word)}[,\\s]+`, 'i'), '');
      out = out.replace(new RegExp(`([.!?])\\s+${escapeRegExp(word)}[,\\s]+`, 'gi'), '$1 ');
      out = out.replace(new RegExp(`,\\s*${escapeRegExp(word)}[,\\s]+`, 'gi'), ', ');
    }
    if (out === before) break;
  }
  return out.trim() || text.trim();
}

function polishEnglishSpeech(text: string, fallback: string, fingerprint?: AiSpeechFingerprint | null): string {
  let out = stripEnglishTransitions(text);
  out = stripEnglishAssistantPhrases(out);
  out = stripEnglishActionNarration(out);
  out = stripFingerprintAvoidedPhrases(out, fingerprint);
  out = stripEnglishTransitions(out);
  out = relaxEnglishCadence(out);
  out = contractEnglishSpeech(out);
  out = shortenEnglishLine(out);
  out = cleanupEnglishPunctuation(out);
  out = capitalizeEnglishSentence(out);
  return out || fallback.trim();
}

function stripEnglishAssistantPhrases(text: string): string {
  let out = text.trim();
  const patterns: Array<[RegExp, string]> = [
    [/^(?:you asked about|you are asking about|you're asking about)\b[^.!?,;:]{0,72}[:,\s-]*/i, ''],
    [/^(?:if (?:you are|you're) asking about)\b[^.!?,;:]{0,72}[:,\s-]*/i, ''],
    [/^i would (?:suggest|recommend|advise)(?: that)? (?:you )?/i, ''],
    [/^i (?:suggest|recommend|advise)(?: that)? (?:you )?/i, ''],
    [/^my recommendation is[:,\s]*/i, ''],
    [/^(?:to answer(?: your question)?|to your question)[:,\s-]*/i, ''],
    [/^(?:if you want my advice|if i were you)[:,\s-]*/i, ''],
    [/^what (?:i can say|i know|i see) is[:,\s]*/i, ''],
    [/^from what i can (?:see|tell)[:,\s-]*/i, ''],
    [/^from (?:the|this|what)[^.!?]{1,72}[,:]\s*/i, ''],
    [/^this (?:means|suggests|indicates)(?: that)?\s*/i, ''],
    [/^that (?:means|tells me|suggests)(?: that)?\s*/i, ''],
    [/^as an ai[:,\s]*/i, ''],
    [/^(?:honestly|to be honest|truth be told|frankly|basically)[,\s-]*/i, ''],
    [/^(?:the short version is|long story short|at the end of the day|more specifically)[,\s:-]*/i, ''],
    [/^(?:the point is|the thing is|what matters is)[:,\s-]*/i, ''],
    [/^i (?:think|guess|would say|d say)\s+/i, ''],
    [/^(?:you should know|let me put it this way|let me say it this way)[:,\s-]*/i, ''],
  ];
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const [pattern, replacement] of patterns) out = out.replace(pattern, replacement);
    if (out === before) break;
  }
  return out.trim() || text.trim();
}

function stripEnglishActionNarration(text: string): string {
  let out = text.trim();
  if (!out) return out;
  out = out.replace(EN_ACTION_START, '');
  out = out.replace(/^[A-Z][A-Za-z0-9' -]{1,32}\s+(?=(?:glances|nods|shakes|stiffens|pauses|leans|sniffs|tilts|squints|steps|backs|flinches|hesitates|looks)\b)/, '');
  out = out.replace(/^(?:he|she|it|they)\s+(?=(?:glances|nods|shakes|stiffens|pauses|leans|sniffs|tilts|squints|steps|backs|flinches|hesitates|looks)\b)/i, '');
  return out.trim() || text.trim();
}

function stripSpeakerPrefix(text: string): string {
  const out = text
    .replace(/^[A-Z][A-Za-z0-9' -]{1,32}:\s+/, '')
    .replace(/^[\u4e00-\u9fffA-Za-z0-9' -]{1,16}[：:]\s*/, '');
  return out.trim() || text.trim();
}

function stripOuterQuotes(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 2; pass++) {
    const before = out;
    out = out
      .replace(/^["'“”‘’「」『』]+/, '')
      .replace(/["'“”‘’「」『』]+$/, '')
      .trim();
    if (out === before) break;
  }
  return out;
}

function shortenSpokenLine(text: string, fallback: string): string {
  const out = shortenEnglishLine(text);
  return out || fallback.trim();
}

function shortenChineseLine(text: string): string {
  const out = text.trim();
  if (!out) return out;
  const sentenceCount = (out.match(/[。！？!?]/g) ?? []).length;
  if (out.length <= 42 && sentenceCount <= 1) return out;
  return firstChineseSentence(out) || firstChineseClause(out) || out;
}

function relaxChineseCadence(text: string): string {
  return text
    .replace(/[；;]\s*/g, '，')
    .replace(/([^\s])[:：]\s*/g, '$1，')
    .trim();
}

function firstChineseSentence(text: string): string {
  const match = text.match(/^.*?[。！？!?]/);
  return match?.[0].trim() ?? '';
}

function firstChineseClause(text: string): string {
  const match = text.match(/^.*?[，,、]/);
  return match?.[0].replace(/[，,、]\s*$/, '。').trim() ?? '';
}

function shortenEnglishLine(text: string): string {
  const out = text.trim();
  if (!out) return out;
  const words = out.split(/\s+/).filter(Boolean);
  const sentenceCount = (out.match(/[.!?]/g) ?? []).length;
  if (words.length <= 18 && out.length <= 120 && sentenceCount <= 1) return out;
  return firstEnglishSentence(out) || firstEnglishClause(out) || out;
}

function relaxEnglishCadence(text: string): string {
  return text
    .replace(/\s*;\s*/g, ', ')
    .replace(/([A-Za-z])\s*:\s*(?=[a-z])/g, '$1, ')
    .replace(/([A-Za-z])\s*:\s*(?=[A-Z])/g, '$1. ')
    .trim();
}

function contractEnglishSpeech(text: string): string {
  return text
    .replace(/\b[Dd]o not\b/g, "don't")
    .replace(/\b[Cc]annot\b/g, "can't")
    .replace(/\b[Ii] am\b/g, "I'm")
    .replace(/\b[Ii]t is\b/g, "it's")
    .replace(/\b[Tt]here is\b/g, "there's")
    .replace(/\b[Tt]here are\b/g, "there are")
    .trim();
}

function firstEnglishSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match?.[0].trim() ?? '';
}

function firstEnglishClause(text: string): string {
  const match = text.match(/^.*?[,;:]/);
  return match?.[0].replace(/[,;:]\s*$/, '.').trim() ?? '';
}

function cleanupChinesePunctuation(text: string): string {
  return text
    .replace(/^[，,、。！？!?\s]+/, '')
    .replace(/[，,、]\s*([。！？!?])/g, '$1')
    .replace(/([。！？!?]){2,}/g, '$1')
    .trim();
}

function cleanupEnglishPunctuation(text: string): string {
  return text
    .replace(/^[,;:\s]+/, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?]){2,}/g, '$1')
    .trim();
}

function capitalizeEnglishSentence(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function stripFingerprintAvoidedPhrases(text: string, fingerprint?: AiSpeechFingerprint | null): string {
  if (!fingerprint || fingerprint.avoidedPhrases.length === 0) return text.trim();
  let out = text.trim();
  for (const phrase of [...new Set(fingerprint.avoidedPhrases.map((value) => value.trim()).filter(Boolean))]) {
    out = stripAvoidedPhrase(out, phrase);
  }
  return out.trim() || text.trim();
}

function stripAvoidedPhrase(text: string, phrase: string): string {
  const escaped = escapeRegExp(phrase);
  const hasLatin = /[A-Za-z]/.test(phrase);
  const prefix = hasLatin
    ? new RegExp(`^${escaped}\\b[,，:：;；\\s-]*`, 'i')
    : new RegExp(`^${escaped}[,，:：;；\\s-]*`);
  const afterStop = hasLatin
    ? new RegExp(`([.!?。！？])\\s*${escaped}\\b[,，:：;；\\s-]*`, 'gi')
    : new RegExp(`([.!?。！？])\\s*${escaped}[,，:：;；\\s-]*`, 'g');
  const afterComma = hasLatin
    ? new RegExp(`([,，;；])\\s*${escaped}\\b[,，:：;；\\s-]*`, 'gi')
    : new RegExp(`([,，;；])\\s*${escaped}[,，:：;；\\s-]*`, 'g');
  return text
    .replace(prefix, '')
    .replace(afterStop, '$1 ')
    .replace(afterComma, '$1 ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ZH_LEADING_TRANSITIONS = [
  '不过',
  '但是',
  '然而',
  '而且',
  '另外',
  '此外',
  '同时',
  '因此',
  '所以',
  '总之',
  '总的来说',
  '需要注意的是',
  '值得一提的是',
  '简单来说',
  '换句话说',
  '从这个角度看',
] as const;

const EN_LEADING_TRANSITIONS = [
  'however',
  'also',
  'additionally',
  'furthermore',
  'therefore',
  'overall',
  'in short',
  'that said',
  'in conclusion',
  'to summarize',
] as const;

export function dynamicSpeechPromptRules(locale: string): string[] {
  const common = [
    '- DynamicText is one short spoken line, not an explanation. Aim for one sentence.',
    '- Sound like the entity is talking in the moment: concrete, sensory, a little incomplete.',
    '- Prefer something a person could blurt while working, watching, walking, or hiding, not narration written for the player.',
    '- Avoid assistant-style transitions, summaries, and lesson-like phrasing.',
    '- Do not start with however, also, therefore, overall, or similar connector words.',
  ];
  if (isChineseLocale(locale)) {
    return [
      ...common,
      '- For Chinese dynamicText, use natural spoken Chinese. Prefer 8-28 Chinese characters when possible.',
      '- Prefer one breath, one image, one reaction. Avoid textbook wording or tidy explanation structure.',
      '- Do not start with 不过, 但是, 然而, 而且, 另外, 此外, 同时, 因此, 所以, 总之, 需要注意的是, or 值得一提的是.',
      '- Do not use 你问的是, 我建议, 从...来看, 这说明, 总的来说, or other Q&A assistant wording.',
    ];
  }
  return [
    ...common,
    '- For English dynamicText, prefer 6-18 words when possible.',
    '- Prefer spoken contractions when natural, and avoid colon-led setup or list-like explanation.',
  ];
}

export function polishDynamicSpeechText(text: string, locale: string): string {
  const normalized = stripOuterQuotes(text.replace(/[ \t\r\n]+/g, ' ').trim());
  if (!normalized) return normalized;
  const withoutSpeaker = stripSpeakerPrefix(normalized);
  if (isChineseLocale(locale)) return polishChineseSpeech(withoutSpeaker, normalized);
  if (isEnglishLocale(locale)) return polishEnglishSpeech(withoutSpeaker, normalized);
  return shortenSpokenLine(withoutSpeaker, normalized);
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

function polishChineseSpeech(text: string, fallback: string): string {
  let out = stripChineseTransitions(text);
  out = stripChineseAssistantPhrases(out);
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
    /^我(?:会)?建议(?:你)?(?:看(?:这边|这里|那边|那儿|这儿)|听我说|先听我说|先看|留神|小心点)?[，,：:\s]*/,
    /^我的建议是[，,：:\s]*/,
    /^我(?:能说|能看出来|看得出|只知道)[，,：:\s]*/,
    /^照我看[，,：:\s]*/,
    /^我(?:认为|觉得)你(?:可以|应该)[，,：:\s]*/,
    /^从[^。！？!?，,]{1,28}(?:来看|看起来|判断)[，,：:\s]*/,
    /^这(?:说明|意味着|表示)(?:着|了)?[，,：:\s]*/,
    /^作为[^，,。！？!?]{0,16}[，,：:\s]*/,
  ];
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const pattern of patterns) out = out.replace(pattern, '');
    if (out === before) break;
  }
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

function polishEnglishSpeech(text: string, fallback: string): string {
  let out = stripEnglishTransitions(text);
  out = stripEnglishAssistantPhrases(out);
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
    [/^what (?:i can say|i know|i see) is[:,\s]*/i, ''],
    [/^from what i can (?:see|tell)[:,\s-]*/i, ''],
    [/^from (?:the|this|what)[^.!?]{1,72}[,:]\s*/i, ''],
    [/^this (?:means|suggests|indicates)(?: that)?\s*/i, ''],
    [/^as an ai[:,\s]*/i, ''],
  ];
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const [pattern, replacement] of patterns) out = out.replace(pattern, replacement);
    if (out === before) break;
  }
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

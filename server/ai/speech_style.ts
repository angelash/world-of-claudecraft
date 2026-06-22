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
  '需要注意的是',
  '值得一提的是',
] as const;

const EN_LEADING_TRANSITIONS = [
  'however',
  'also',
  'additionally',
  'furthermore',
  'therefore',
  'overall',
  'in short',
] as const;

export function dynamicSpeechPromptRules(locale: string): string[] {
  const common = [
    '- DynamicText is one short spoken line, not an explanation. Aim for one sentence.',
    '- Sound like the entity is talking in the moment: concrete, sensory, a little incomplete.',
    '- Avoid assistant-style transitions, summaries, and lesson-like phrasing.',
    '- Do not start with however, also, therefore, overall, or similar connector words.',
  ];
  if (isChineseLocale(locale)) {
    return [
      ...common,
      '- For Chinese dynamicText, use natural spoken Chinese. Prefer 8-28 Chinese characters when possible.',
      '- Do not start with 不过, 但是, 然而, 而且, 另外, 此外, 同时, 因此, 所以, 总之, 需要注意的是, or 值得一提的是.',
    ];
  }
  return [
    ...common,
    '- For English dynamicText, prefer 6-18 words when possible.',
  ];
}

export function polishDynamicSpeechText(text: string, locale: string): string {
  const normalized = text.replace(/[ \t\r\n]+/g, ' ').trim();
  if (!normalized) return normalized;
  if (isChineseLocale(locale)) return stripChineseTransitions(normalized);
  if (isEnglishLocale(locale)) return stripEnglishTransitions(normalized);
  return normalized;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

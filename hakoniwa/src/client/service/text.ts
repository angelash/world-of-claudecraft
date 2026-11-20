// The control notice must render even when the game or its content modules fail to load.
// Read the same source-language catalog without loading the game-wide content lookup.
import source from '../../../locales/zh-Hans/ui_service.json';

export function serviceText(key: keyof typeof source, params: { n?: number } = {}): string {
  return source[key].replace('{n, number}', new Intl.NumberFormat('zh-CN').format(params.n ?? 0));
}

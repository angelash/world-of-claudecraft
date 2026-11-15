// The data/ JSON files as bundled at page build time. This is the read-only fallback
// when the dev service is unavailable, and the baseline the workspace uses to locate
// which built content rows came from which file. Keys are paths under data/.

const modules = import.meta.glob<unknown>('/data/**/*.json', { eager: true, import: 'default' });

export function staticDataFiles(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(modules)) {
    out[key.replace(/^\/data\//, '')] = value;
  }
  return out;
}

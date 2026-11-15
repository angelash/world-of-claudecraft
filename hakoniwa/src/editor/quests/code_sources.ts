// System and game source texts for the flag index, bundled at build time and loaded
// lazily (only when the quest graph opens). Keys are paths under src/.

const loaders = import.meta.glob<string>(['/src/systems/**/*.ts', '/src/game/**/*.ts'], {
  query: '?raw',
  import: 'default',
});

export async function loadCodeSources(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(loaders).map(
      async ([key, load]) => [key.replace(/^\/src\//, ''), await load()] as const,
    ),
  );
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

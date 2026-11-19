// Inspect decoded response strings so JSON escaping cannot hide a credential fragment.

export function containsCredential(value: unknown, credentials: Iterable<string>): boolean {
  const fragments = new Set<string>();
  for (const secret of credentials) {
    if (!secret) continue;
    const width = Math.min(8, secret.length);
    for (let i = 0; i <= secret.length - width; i++) {
      fragments.add(secret.slice(i, i + width));
    }
  }
  if (fragments.size === 0) return false;
  const matches = (text: string) => {
    for (const fragment of fragments) if (text.includes(fragment)) return true;
    return false;
  };
  const pending: unknown[] = [value];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (
      typeof current === 'string' ||
      typeof current === 'number' ||
      typeof current === 'boolean'
    ) {
      if (matches(String(current))) return true;
    } else if (current && typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      for (const [key, child] of Object.entries(current)) {
        if (matches(key)) return true;
        pending.push(child);
      }
    }
  }
  return false;
}

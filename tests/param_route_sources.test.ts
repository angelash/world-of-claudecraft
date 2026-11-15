import { describe, expect, it } from 'vitest';
import { paramRouteRegexSources } from './helpers/param_route_sources';

describe('parameterized route source harvesting', () => {
  it('keeps a slash inside a regex character class in the audited route', () => {
    const source = String.raw`const aiAuditMatch = /^\/admin\/api\/ai\/audit\/([^/]+)$/.exec(path);`;
    expect([...paramRouteRegexSources(source)]).toEqual([
      /^\/admin\/api\/ai\/audit\/([^/]+)$/.source,
    ]);
  });

  it('reads escaped classes and flags while leaving source identity intact', () => {
    const source = String.raw`const accountMatch = /^\/api\/accounts\/(\d+)$/.exec(path);
      const slugMatch = /^\/api\/slugs\/([a-z/]+)$/i.exec(path);`;
    expect([...paramRouteRegexSources(source)]).toEqual([
      /^\/api\/accounts\/(\d+)$/.source,
      /^\/api\/slugs\/([a-z/]+)$/i.source,
    ]);
  });

  it('rejects commented and quoted declarations and unrelated matching calls', () => {
    const source = String.raw`
      // const hiddenMatch = /^\/api\/hidden\/(\d+)$/.exec(path);
      /* const removedMatch = /^\/api\/removed\/(\d+)$/.exec(path); */
      const fixture = 'const quotedMatch = /^\\/api\\/quoted\\/(\\d+)$/.exec(path)';
      const other = /^\/api\/other\/(\d+)$/.exec(path);
      const dynamicMatch = buildRegex().exec(path);
    `;
    expect([...paramRouteRegexSources(source)]).toEqual([]);
  });
});

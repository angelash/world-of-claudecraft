// Hash routes of the workbench: "#/<tool>?key=value&...". The route holds the open
// tool and its selection, so a reload (Vite reloads the page after a data file is
// written) returns to the same place. Pure.

export interface Route {
  tool: string;
  params: Record<string, string>;
}

export function parseRoute(hash: string, fallbackTool: string): Route {
  const text = hash.replace(/^#\/?/, '');
  const q = text.indexOf('?');
  const tool = (q < 0 ? text : text.slice(0, q)).trim() || fallbackTool;
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const [k, v] of new URLSearchParams(text.slice(q + 1))) params[k] = v;
  }
  return { tool, params };
}

export function formatRoute(route: Route): string {
  const entries = Object.entries(route.params).filter(([, v]) => v !== '');
  const query = new URLSearchParams(entries).toString();
  return `#/${route.tool}${query ? `?${query}` : ''}`;
}

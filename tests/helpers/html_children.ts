// HTML void elements (per spec); everything else, SVG children included,
// closes explicitly. Treating <path> as void desynchronizes the depth walk.
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export interface HarvestedChild {
  id: string;
  classes: string[];
  /** The raw inner slice, so a container's own children can be harvested. */
  inner: string;
}

/** Direct children of the element whose OPENING TAG starts at `openAt`. */
export function directChildren(markup: string, openAt: number): HarvestedChild[] {
  const tagRe = /<(\/?)([a-z][a-z0-9-]*)([^>]*?)(\/?)>/gi;
  tagRe.lastIndex = openAt;
  const rootTag = tagRe.exec(markup);
  if (!rootTag || rootTag[1] === '/') throw new Error('directChildren must start at an open tag');
  const children: HarvestedChild[] = [];
  let depth = 1;
  let childOpen: { at: number; attrs: string; contentAt: number } | null = null;
  for (let m = tagRe.exec(markup); m; m = tagRe.exec(markup)) {
    const [whole, closing, tag, attrs, selfClose] = m;
    const voidTag = VOID_TAGS.has(tag.toLowerCase()) || selfClose === '/';
    if (closing === '/') {
      depth -= 1;
      if (depth === 0) break;
      if (depth === 1 && childOpen) {
        children.push(harvested(childOpen.attrs, markup.slice(childOpen.contentAt, m.index)));
        childOpen = null;
      }
      continue;
    }
    if (depth === 1) {
      if (voidTag) children.push(harvested(attrs, ''));
      else childOpen = { at: m.index, attrs, contentAt: m.index + whole.length };
    }
    if (!voidTag) depth += 1;
  }
  if (depth !== 0) throw new Error('unbalanced markup under the harvested root');
  return children;
}

function harvested(attrs: string, inner: string): HarvestedChild {
  const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? '';
  const classes = (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean);
  return { id, classes, inner };
}

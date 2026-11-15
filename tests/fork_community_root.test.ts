import { describe, expect, it } from 'vitest';
import { forkCommunityRoot } from './helpers/fork_community_root';
import { directChildren } from './helpers/html_children';

const UI = '<div id="ui"><div id="fork-shell-community-mount"></div></div>';
const CONFIG =
  '<script id="fork-shell-config" type="application/json">{"mounts":{"communityHud":"#fork-shell-community-mount"}}</script>';
const PACK =
  '<template id="fork-shell-template"><div data-fork-shell-slot="communityHud"><nav id="community-hud"><details id="community-menu"><img src="icon.webp"><svg><path></path></svg></details></nav></div></template>';
const fixture = (ui = UI, pack = PACK, config = CONFIG) => ({ ui, html: ui + config + pack });

describe('forkCommunityRoot', () => {
  it('reads the actual mounted root and preserves every descendant for the consumer', () => {
    const input = fixture();
    const root = forkCommunityRoot(input.html, input.ui);
    expect(root?.id).toBe('community-hud');
    expect(root?.inner).toContain('<details id="community-menu">');
    expect(root?.inner).toContain('<svg><path></path></svg>');
  });

  it('leaves an entry with a directly authored community nav uncomposed', () => {
    const inline = '<div id="ui"><nav id="community-hud"></nav></div>';
    expect(forkCommunityRoot(inline, inline)).toBeNull();
  });

  it.each([
    ['missing pack', fixture(UI, '')],
    ['commented pack', fixture(UI, `<!--${PACK}-->`)],
    ['missing config', fixture(UI, PACK, '')],
    ['wrong selector', fixture(UI, PACK, CONFIG.replace('#fork-shell-community-mount', '#wrong'))],
    ['missing target', fixture(UI.replace('id="fork-shell-community-mount"', 'id="missing"'))],
    [
      'commented target',
      fixture(
        UI.replace(
          '<div id="fork-shell-community-mount"></div>',
          '<!--<div id="fork-shell-community-mount"></div>-->',
        ),
      ),
    ],
    [
      'wrong slot',
      fixture(
        UI,
        PACK.replace('data-fork-shell-slot="communityHud"', 'data-fork-shell-slot="wrong"'),
      ),
    ],
    ['wrong root', fixture(UI, PACK.replace('id="community-hud"', 'id="wrong"'))],
    ['multiple roots', fixture(UI, PACK.replace('</nav>', '</nav><nav id="extra"></nav>'))],
    ['duplicate pack', fixture(UI, PACK + PACK)],
    [
      'nonempty target',
      fixture(
        UI.replace(
          'id="fork-shell-community-mount">',
          'id="fork-shell-community-mount"><span></span>',
        ),
      ),
    ],
  ])('refuses %s instead of silently dropping a mounted surface', (_label, input) => {
    expect(() => forkCommunityRoot(input.html, input.ui)).toThrow(/fork community/);
  });

  it('the shared child reader keeps void tags and nested SVG elements at the right depth', () => {
    const root =
      '<div><nav id="first"><img><svg><path></path></svg></nav><div id="second"></div></div>';
    expect(directChildren(root, 0).map((child) => child.id)).toEqual(['first', 'second']);
    expect(() => directChildren('<div><nav></nav>', 0)).toThrow('unbalanced markup');
  });
});

import { directChildren, type HarvestedChild } from './html_children';

export const FORK_COMMUNITY_MOUNT = 'fork-shell-community-mount';

/** Read the actual slot root that mountForkShell inserts into the HUD. */
export function forkCommunityRoot(html: string, uiMarkup: string): HarvestedChild | null {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const ui = uiMarkup.replace(/<!--[\s\S]*?-->/g, '');
  const configs = [
    ...clean.matchAll(/<script\b[^>]*\sid="fork-shell-config"[^>]*>([\s\S]*?)<\/script>/g),
  ];
  const packs = [
    ...clean.matchAll(/<template\b[^>]*\sid="fork-shell-template"[^>]*>([\s\S]*?)<\/template>/g),
  ];
  const mounts = [...ui.matchAll(/<div\b[^>]*\sid="fork-shell-community-mount"[^>]*>/g)];
  if (configs.length === 0 && packs.length === 0 && mounts.length === 0) return null;
  if (configs.length !== 1 || packs.length !== 1 || mounts.length !== 1) {
    throw new Error('fork community mount requires one config, template pack, and target');
  }
  const config = JSON.parse(configs[0][1]) as { mounts?: { communityHud?: string } };
  if (config.mounts?.communityHud !== `#${FORK_COMMUNITY_MOUNT}`) {
    throw new Error('fork community mount selector differs from the classified wrapper');
  }
  if (
    directChildren(ui, mounts[0].index).length !== 0 ||
    !/^\s*<\/div>/.test(ui.slice(mounts[0].index + mounts[0][0].length))
  ) {
    throw new Error('fork community slot must mount into one empty structural wrapper');
  }
  const pack = packs[0][1];
  const slots = [...pack.matchAll(/<div\b[^>]*\sdata-fork-shell-slot="communityHud"[^>]*>/g)];
  if (slots.length !== 1) throw new Error('fork community slot is missing or duplicated');
  const children = directChildren(pack, slots[0].index);
  if (children.length !== 1 || children[0].id !== 'community-hud') {
    throw new Error('fork community slot must contain the registered community-hud surface');
  }
  return children[0];
}

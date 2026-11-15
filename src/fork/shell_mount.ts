type ForkShellSlot = 'communityHud' | 'headerActions' | 'footerControls';

type ForkShellMountMap = Record<ForkShellSlot, string>;

type ForkShellConfig = {
  hideDonate: boolean;
  mounts: ForkShellMountMap;
};

type RawForkShellConfig = Partial<{
  hideDonate: boolean;
  mounts: Partial<ForkShellMountMap>;
}>;

const FORK_SHELL_CONFIG_ID = 'fork-shell-config';
const FORK_SHELL_TEMPLATE_ID = 'fork-shell-template';

const DEFAULT_FORK_SHELL_CONFIG: ForkShellConfig = {
  hideDonate: true,
  mounts: {
    communityHud: '#fork-shell-community-mount',
    headerActions: '#fork-shell-header-actions-mount',
    footerControls: '#fork-shell-footer-controls-mount',
  },
};

function readForkShellConfig(): ForkShellConfig {
  const configEl = document.getElementById(FORK_SHELL_CONFIG_ID);
  if (!configEl?.textContent?.trim()) return DEFAULT_FORK_SHELL_CONFIG;
  try {
    const raw = JSON.parse(configEl.textContent) as RawForkShellConfig;
    return {
      hideDonate: raw.hideDonate ?? DEFAULT_FORK_SHELL_CONFIG.hideDonate,
      mounts: {
        ...DEFAULT_FORK_SHELL_CONFIG.mounts,
        ...raw.mounts,
      },
    };
  } catch (err) {
    console.error('Invalid fork shell config.', err);
    return DEFAULT_FORK_SHELL_CONFIG;
  }
}

function mountForkShellSlot(
  template: HTMLTemplateElement,
  slot: ForkShellSlot,
  selector: string,
): void {
  const target = document.querySelector(selector) as HTMLElement | null;
  if (!target || target.dataset.forkShellMounted === '1') return;
  const slotSource = template.content.querySelector(
    `[data-fork-shell-slot="${slot}"]`,
  ) as HTMLElement | null;
  if (!slotSource) throw new Error(`Fork shell slot "${slot}" is missing.`);
  const clones = Array.from(slotSource.childNodes, (node) => node.cloneNode(true));
  target.replaceChildren(...clones);
  target.dataset.forkShellMounted = '1';
}

export function mountForkShell(): void {
  const config = readForkShellConfig();
  if (config.hideDonate) document.body.dataset.forkHideDonate = '1';
  else delete document.body.dataset.forkHideDonate;

  const template = document.getElementById(FORK_SHELL_TEMPLATE_ID) as HTMLTemplateElement | null;
  if (!template) return;
  (Object.keys(config.mounts) as ForkShellSlot[]).forEach((slot) => {
    mountForkShellSlot(template, slot, config.mounts[slot]);
  });
}

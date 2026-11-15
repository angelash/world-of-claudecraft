// Which PlatformHost the page runs on: the desktop host when the desktop shell's preload
// exposed window.hk, the web host otherwise. Tests build the memory host directly.

import { createDesktopHost, isHkBridge } from './desktop_host';
import type { PlatformHost, PlatformKind } from './host';
import { createWebHost, type WebHostOptions } from './web_host';

/** The part of the page's global scope the choice reads (pass `window`). */
export interface PlatformScope {
  readonly hk?: unknown;
}

export function platformKindOf(scope: PlatformScope): Exclude<PlatformKind, 'memory'> {
  return isHkBridge(scope.hk) ? 'desktop' : 'web';
}

/** The desktop host over window.hk when present, else the web host built from `web`. */
export function selectPlatformHost(scope: PlatformScope, web: WebHostOptions): PlatformHost {
  return isHkBridge(scope.hk) ? createDesktopHost(scope.hk) : createWebHost(web);
}

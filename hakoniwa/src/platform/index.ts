// The platform layer's public surface (release_engineering.md 2.2). Only src/client/
// imports it; the memory host is for tests and is imported by path, not from here, so a
// client bundle never carries it.

export { createDesktopHost, isHkBridge } from './desktop_host';
export * from './host';
export { type PlatformScope, platformKindOf, selectPlatformHost } from './select';
export {
  type ConsoleLike,
  createWebHost,
  type KeyValueLike,
  LazySaveBackend,
  MemoryKeyValue,
  WEB_KEYS,
  type WebHostOptions,
} from './web_host';

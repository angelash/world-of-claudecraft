// Game page preload (docs/50_tech/release_engineering.md 2.3): exposes exactly one object,
// window.hk, built by createHkBridge. Runs sandboxed and context-isolated; bundled by
// desktop/build.ts into one file whose only require is electron.

import { contextBridge, ipcRenderer } from 'electron';
import { createHkBridge } from './bridge';

contextBridge.exposeInMainWorld('hk', createHkBridge(ipcRenderer));

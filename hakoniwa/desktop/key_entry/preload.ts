// Key entry window preload (docs/50_tech/llm_providers.md 5.5): exposes only submit, paste
// and cancel as window.hkKey. Paste asks the main process to read the clipboard itself, so
// the key never passes through this page when pasted. Bundled to one file like the game
// preload.

import { contextBridge, ipcRenderer } from 'electron';
import { KEY_ENTRY_NAMES } from '../ipc/names';

contextBridge.exposeInMainWorld('hkKey', {
  submit: (secret: string) =>
    ipcRenderer.invoke(KEY_ENTRY_NAMES.submit, { secret: String(secret) }),
  paste: () => ipcRenderer.invoke(KEY_ENTRY_NAMES.paste),
  cancel: () => ipcRenderer.send(KEY_ENTRY_NAMES.cancel),
});

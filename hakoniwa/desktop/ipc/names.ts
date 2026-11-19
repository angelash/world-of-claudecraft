// Channel names only, with no imports, so the sandboxed preloads (which can require nothing
// but electron) bundle them without pulling in the main-process checks. desktop/ipc/channels.ts
// builds the full table from these names.

export const HK_NAMES = {
  appInfo: 'hk:app.info',
  saveList: 'hk:save.list',
  saveWrite: 'hk:save.write',
  saveRead: 'hk:save.read',
  saveDelete: 'hk:save.delete',
  saveRecoverables: 'hk:save.recoverables',
  saveRestore: 'hk:save.restore',
  saveImportDemo: 'hk:save.importDemo',
  settingsGet: 'hk:settings.get',
  settingsSet: 'hk:settings.set',
  llmRequest: 'hk:llm.request',
  llmAbort: 'hk:llm.abort',
  llmScope: 'hk:llm.scope',
  llmSecretEnter: 'hk:llm.secret.enter',
  llmSecretHas: 'hk:llm.secret.has',
  llmSecretClear: 'hk:llm.secret.clear',
  llmModels: 'hk:llm.models',
  llmTest: 'hk:llm.test',
  llmLedger: 'hk:llm.ledger',
  llmWipe: 'hk:llm.wipe',
  llmProblem: 'hk:llm.problem',
  steamAchieve: 'hk:steam.achieve',
  steamStat: 'hk:steam.stat',
  steamPresence: 'hk:steam.presence',
  steamStatus: 'hk:steam.status',
  diagExport: 'hk:diag.export',
  crashPending: 'hk:crash.pending',
  crashSend: 'hk:crash.send',
  windowMode: 'hk:window.mode',
  windowFrameCap: 'hk:window.frameCap',
  shellOpenExternal: 'hk:shell.openExternal',
  log: 'hk:log',
  event: 'hk:event',
} as const;

export const KEY_ENTRY_NAMES = {
  submit: 'hk:key.submit',
  paste: 'hk:key.paste',
  cancel: 'hk:key.cancel',
} as const;

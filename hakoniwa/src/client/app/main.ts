// Client entry: title screen, then one GameSession per running world. Loading a save
// replaces the session with one built on the resumed world. The game factory is loaded
// dynamically so a broken system module shows an error on the title screen instead of a
// blank page. Saves and settings go through PlatformHost (release_engineering.md 2.2): the
// desktop shell's files over window.hk, or on the web the save container over IndexedDB
// (memory when the browser has none) and settings in local storage (D-088).

import '../client.css';
import { version as gameVersion } from '../../../package.json';
import type { Engine } from '../../core/engine';
import { RENAME_VERSION, runIdFromBytes } from '../../core/save';
import type { World } from '../../core/world';
import { MemoryKeyValue, selectPlatformHost } from '../../platform';
import { fmt, T } from '../../shared_ui/text';
import { installApprovedArt } from '../assets';
import {
  CLIENT_LOG_LIMIT,
  ClientSaves,
  type LoadedSave,
  loadErrorText,
  loadNote,
  type SlotId,
  slotLabel,
} from '../hud/save_slots';
import { createAdapters } from './adapters_wiring';
import { AiBridge } from './ai_bridge';
import { BootScreen } from './boot_screen';
import { parseConfig } from './config';
import { gatewayLedger, pageStorage } from './platform_wiring';
import { GameSession } from './session';
import { SettingsStore } from './settings_store';

const config = parseConfig(window.location.search, import.meta.env.DEV);
const root = document.getElementById('app') ?? document.body;
/** The page's local storage, or null when the browser does not let the page use it. */
const pageKv = pageStorage(window);
const kv = pageKv ?? new MemoryKeyValue();
const webBuild = import.meta.env.DEV ? 'dev' : 'web';
const webVersions = { gameVersion, renameVersion: RENAME_VERSION, build: webBuild };
// window.hk exists only inside the desktop shell (its preload bridge).
const host = selectPlatformHost(window as Window & { readonly hk?: unknown }, {
  version: gameVersion,
  build: webBuild,
  writerName: T.saves.writerBrowser,
  storage: pageKv,
  indexedDB: typeof indexedDB === 'undefined' ? null : indexedDB,
  openWindow: (url) => {
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    return opened;
  },
  console,
  versions: webVersions,
});
document.title = T.app.title;

let saves: ClientSaves;
let settings: SettingsStore;
let ai: AiBridge;
let session: GameSession | null = null;
let boot: BootScreen | null = null;

function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

function showTitle(): void {
  session?.dispose();
  session = null;
  saves.detach();
  boot?.dispose();
  boot = new BootScreen(
    root,
    saves,
    {
      newGame: (seed) =>
        startWith(async () => {
          if (import.meta.env.DEV && config.sandbox) {
            const { createSandboxGame } = await import('./sandbox');
            return createSandboxGame(seed ?? config.seed ?? 1, config.startHour);
          }
          const { createGame } = await import('../../game/create');
          await ai.probe();
          return createGame({
            seed: seed ?? config.seed,
            aiMode: ai.mode(),
            logLimit: CLIENT_LOG_LIMIT,
          });
        }),
      load: (slot: SlotId) =>
        void (async () => {
          let loaded: LoadedSave;
          try {
            loaded = await saves.load(slot);
          } catch (err) {
            console.error(err);
            boot?.setStatus(fmt(T.saves.loadFailed, { reason: loadErrorText(err) }));
            return;
          }
          await startWith(
            () => resume(loaded.world),
            loadedLine(fmt(T.log.loaded, { slot: slotLabel(slot) }), loaded),
            loaded,
          );
        })(),
    },
    config.devMode,
    config.seed,
  );
}

async function resume(world: World): Promise<Engine> {
  if (import.meta.env.DEV && config.sandbox) {
    const { resumeSandboxGame } = await import('./sandbox');
    return resumeSandboxGame(world);
  }
  const { resumeGame } = await import('../../game/create');
  await ai.probe();
  return resumeGame(world, { aiMode: ai.mode(), logLimit: CLIENT_LOG_LIMIT });
}

/** The "loaded" line, with a note when the load fell back to an older generation. */
function loadedLine(line: string, loaded: LoadedSave): string {
  const note = loadNote(loaded);
  return note ? fmt(T.saves.withNote, { line, note }) : line;
}

async function startWith(
  make: () => Promise<Engine>,
  greeting?: string,
  from?: LoadedSave,
): Promise<void> {
  let engine: Engine;
  try {
    engine = await make();
  } catch (err) {
    console.error(err);
    boot?.setStatus(fmt(T.app.bootFailed, { reason: errorText(err) }));
    return;
  }
  boot?.dispose();
  boot = null;
  session?.dispose();
  saves.attach(engine, from ?? null);
  session = new GameSession({
    engine,
    root,
    devMode: config.devMode,
    adapters: createAdapters(),
    saves,
    settings: ai,
    prefs: settings,
    greeting,
    loadWorld: (loaded: LoadedSave, line: string) =>
      void startWith(() => resume(loaded.world), loadedLine(line, loaded), loaded),
    toTitle: () => showTitle(),
  });
  ai.attach(engine);
  session.start();
  if (config.devMode) {
    // Console access for debugging in dev builds only.
    (window as unknown as { hakoniwa?: unknown }).hakoniwa = { session, engine, host, settings };
  }
}

/** The desktop build stamp for slot headers; the web build label when the shell cannot say. */
async function buildLabel(): Promise<string> {
  if (host.kind !== 'desktop') return webBuild;
  try {
    return (await host.info()).build;
  } catch {
    return 'unknown';
  }
}

async function start(): Promise<void> {
  settings = await SettingsStore.open(host.settings, {
    legacy: kv,
    // Only the web development build has a dev proxy to ask before migrating 'on'.
    deferLegacyAiOn: import.meta.env.DEV && host.kind === 'web',
    web: host.kind === 'web',
    log: (message) => console.warn(message),
  });
  // The AI bridge keeps its model settings in the local part's llm partition, through the
  // settings store so every write of that part goes through one queue.
  ai = new AiBridge(kv, {
    llm: host.llm,
    settingsStore: settings.llmPartStore(),
    runId: () => saves?.runId ?? 'default',
    ledger: () => gatewayLedger(host.llm),
  });
  void ai.probe();

  const versions = { ...webVersions, build: await buildLabel() };
  const durability = await host.durability();
  saves = new ClientSaves({
    backend: host.saves,
    now: () => Date.now(),
    newRunId: () => runIdFromBytes(crypto.getRandomValues(new Uint8Array(8))),
    versions,
    // The first web build's key-value saves move into the container once; the desktop
    // build never imports them (release_engineering.md 5.2).
    legacy: host.kind === 'web' ? pageKv : null,
    durable: durability.saves,
  });
  await saves.open();
  // Approved art replaces the placeholders before the first world is drawn (development
  // builds only; a no-op with an empty manifest or ?art=procedural).
  await installApprovedArt();
  showTitle();
  if (!saves.durable) boot?.setStatus(T.saves.memoryOnly);
  else if (!durability.settings) boot?.setStatus(T.prefs.memoryOnly);
  else if (settings.fromNewerVersion()) boot?.setStatus(T.prefs.newerVersion);
}

start().catch((err: unknown) => {
  // Nothing above is expected to throw; if it does, say so instead of a blank page.
  console.error(err);
  root.textContent = fmt(T.app.bootFailed, { reason: errorText(err) });
});

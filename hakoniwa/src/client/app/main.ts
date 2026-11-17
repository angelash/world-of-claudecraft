// Client entry: title screen, the new game page (ui_scr_newgame: difficulty, ironman,
// guidance), then one GameSession per running world. Loading a save
// replaces the session with one built on the resumed world. The game factory is loaded
// dynamically so a broken system module shows an error on the title screen instead of a
// blank page. Saves and settings go through PlatformHost (release_engineering.md 2.2): the
// desktop shell's files over window.hk, or on the web the save container over IndexedDB
// (memory when the browser has none) and settings in local storage (D-088).

import '../client.css';
import { version as gameVersion } from '../../../package.json';
import type { Engine } from '../../core/engine';
import {
  createMigrator,
  RENAME_VERSION,
  runIdFromBytes,
  type WorldMigrator,
} from '../../core/save';
import type { World } from '../../core/world';
import { MemoryKeyValue, selectPlatformHost } from '../../platform';
import { contentTextLookup, setContentText, setTextLanguage, t } from '../../shared_ui/i18n';
import { installApprovedArt } from '../assets';
import { setConfirmPrefs } from '../hud/confirm_pop';
import { MANUAL_LIMIT } from '../hud/save_list_model';
import {
  CLIENT_LOG_LIMIT,
  ClientSaves,
  type LoadedSave,
  loadErrorText,
  loadNote,
  type SlotId,
  slotLabel,
} from '../hud/save_slots';
import { installKeyText } from '../input/glyphs';
import { startMenuPad } from '../input/menu_pad';
import type { ClientCommand } from '../view/game_view';
import { createAdapters } from './adapters_wiring';
import { AiBridge } from './ai_bridge';
import { BootScreen } from './boot_screen';
import { parseConfig } from './config';
import { aiCardEnv, type NewGameChoices, startCommands } from './newgame_model';
import { NewGameScreen } from './newgame_screen';
import { gatewayLedger, pageStorage } from './platform_wiring';
import { GameSession } from './session';
import { SettingsStore } from './settings_store';

const config = parseConfig(window.location.search, import.meta.env.DEV);
// Interface language first, before any text renders (only the source language and, in dev
// builds, the pseudo-locale exist before 1.1).
if (config.lang) setTextLanguage(config.lang);
// Dev builds outline unfilled placeholders and keys shown as themselves in red (20.3).
if (import.meta.env.DEV) {
  void import('./dev_text_marks').then((m) => m.installMissingTextMarks(document.body));
}
const root = document.getElementById('app') ?? document.body;
// {key:} placeholders read the default bindings until a session installs the live ones, and
// a gamepad can drive the title screen (ux_and_onboarding.md 16).
installKeyText(null);
startMenuPad(root, () => settings?.sync.input.swapConfirmBack ?? false);
/** The page's local storage, or null when the browser does not let the page use it. */
const pageKv = pageStorage(window);
const kv = pageKv ?? new MemoryKeyValue();
const webBuild = import.meta.env.DEV ? 'dev' : 'web';
const webVersions = { gameVersion, renameVersion: RENAME_VERSION, build: webBuild };
// window.hk exists only inside the desktop shell (its preload bridge).
const host = selectPlatformHost(window as Window & { readonly hk?: unknown }, {
  version: gameVersion,
  build: webBuild,
  writerName: t('ui.win.saves.writer_browser'),
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
document.title = t('ui.common.game_title');

let saves: ClientSaves;
let settings: SettingsStore;
let ai: AiBridge;
let session: GameSession | null = null;
let boot: BootScreen | null = null;
let newGame: NewGameScreen | null = null;

function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

function showTitle(): void {
  session?.dispose();
  session = null;
  saves.detach();
  newGame?.dispose();
  newGame = null;
  boot?.dispose();
  boot = new BootScreen(
    root,
    saves,
    {
      newGame: (seed) => showNewGame(seed),
      load: (slot: SlotId) =>
        void (async () => {
          let loaded: LoadedSave;
          try {
            loaded = await saves.load(slot);
          } catch (err) {
            console.error(err);
            boot?.setStatus(t('ui.win.saves.load_failed', { reason: loadErrorText(err) }));
            return;
          }
          await startWith(
            () => resume(loaded.world),
            loadedLine(t('ui.hud.log.loaded', { slot: slotLabel(slot) }), loaded),
            loaded,
          );
        })(),
    },
    config.devMode,
    config.seed,
  );
}

/** The new game page over the title (ux_and_onboarding.md 3.4); back closes it. */
function showNewGame(seed?: number): void {
  newGame?.dispose();
  newGame = new NewGameScreen(
    root,
    {
      ai: aiCardEnv(ai.settings()),
      storage: { durable: saves.durable, low: false },
      ironmanSlotTaken: saves.has('ironman') || saves.problems().ironman !== undefined,
    },
    {
      back: () => {
        newGame?.dispose();
        newGame = null;
      },
      start: (choices) => void beginRun(choices, seed),
    },
    { guidance: settings.sync.gameplay.guidance },
  );
}

/**
 * Start a run with the new game page's choices: the guidance level into the settings, an old
 * ironman save removed before a new ironman run takes the slot (release_engineering.md 5.1),
 * the built-in variables difficulty and ironman queued for the first tick.
 */
async function beginRun(choices: NewGameChoices, seed?: number): Promise<void> {
  newGame?.dispose();
  newGame = null;
  boot?.setStatus(t('ui.scr.boot.loading'));
  // Let the status paint before the synchronous world build.
  await new Promise((r) => setTimeout(r, 16));
  if (choices.ironman && (saves.has('ironman') || saves.problems().ironman !== undefined)) {
    try {
      await saves.remove('ironman');
    } catch (err) {
      console.warn('[saves] removing the old ironman save failed', err);
    }
  }
  settings.updateSync({ gameplay: { ...settings.sync.gameplay, guidance: choices.guidance } });
  await startWith(
    async () => {
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
    },
    undefined,
    undefined,
    { ironman: choices.ironman, commands: startCommands(choices) },
  );
}

/** Leave the running world for the title: an ironman run saves on the way out (3.4.1). */
async function exitToTitle(): Promise<void> {
  const failed = (await session?.exitSave()) ?? null;
  showTitle();
  // the run is gone with its session: the title says the exit save did not go through
  if (failed) boot?.setStatus(failed);
}

/**
 * The content id migrator a slot load runs through (release_engineering.md 5.5): the shipped
 * rename table plus every game system's `idFields`, so a save from before a content id rename
 * (the ability and aura renumbering of PK-M1-26, for example) comes back with the current ids
 * wherever the combat slice or its events hold one, not only in its flags. Built once, the
 * game systems loaded the same deferred way as `resume` and `beginRun`'s world build, so a
 * broken system module still only breaks starting or loading a world, never the title screen.
 */
let migratorPromise: Promise<WorldMigrator> | null = null;
function clientMigrator(): Promise<WorldMigrator> {
  migratorPromise ??= import('../../game/registry').then(({ allSystems }) =>
    createMigrator({ owners: allSystems() }),
  );
  return migratorPromise;
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
  return note ? t('ui.win.saves.with_note', { line, note }) : line;
}

async function startWith(
  make: () => Promise<Engine>,
  greeting?: string,
  from?: LoadedSave,
  run: { ironman?: boolean; commands?: readonly ClientCommand[] } = {},
): Promise<void> {
  let engine: Engine;
  try {
    engine = await make();
  } catch (err) {
    console.error(err);
    boot?.setStatus(t('ui.scr.boot.boot_failed', { reason: errorText(err) }));
    return;
  }
  // c.* keys resolve against the content this world runs on (the generated content table is
  // the fallback for anything the live content lacks).
  setContentText(contentTextLookup(engine.content));
  boot?.dispose();
  boot = null;
  session?.dispose();
  // A new run's opening commands go in before the first tick, so its replay starts the same.
  for (const c of run.commands ?? []) engine.queue(c.kind, c.data as never);
  saves.attach(engine, from ?? null, { ironman: run.ironman });
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
    toTitle: () => void exitToTitle(),
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
  // The confirm popup reads holds as presses when the accessibility setting says so (18.5),
  // the new game page's confirm included; a session keeps it current after that.
  setConfirmPrefs({
    holdToToggle: settings.sync.accessibility.holdToToggle,
    swapConfirmBack: settings.sync.input.swapConfirmBack,
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
    // Content id renames reach the slices on load (the sandbox world holds a subset of the
    // systems: the kernel default, flags only, as before).
    migrator: import.meta.env.DEV && config.sandbox ? undefined : clientMigrator,
    // The first web build's key-value saves move into the container once; the desktop
    // build never imports them (release_engineering.md 5.2).
    legacy: host.kind === 'web' ? pageKv : null,
    durable: durability.saves,
    // Thumbnails and difficulties beside the slots (thumbs/<slotId>.png is a later backend step).
    extras: pageKv,
    aiPreset: () => ai.settings().preset,
    manualLimit: host.kind === 'web' ? MANUAL_LIMIT.web : MANUAL_LIMIT.desktop,
  });
  await saves.open();
  // Approved art replaces the placeholders before the first world is drawn (development
  // builds only; a no-op with an empty manifest or ?art=procedural).
  await installApprovedArt();
  showTitle();
  if (!saves.durable) boot?.setStatus(t('ui.win.saves.memory_only'));
  else if (!durability.settings) boot?.setStatus(t('ui.scr.settings.memory_only'));
  else if (settings.fromNewerVersion()) boot?.setStatus(t('ui.scr.settings.newer_version'));
}

start().catch((err: unknown) => {
  // Nothing above is expected to throw; if it does, say so instead of a blank page.
  console.error(err);
  root.textContent = t('ui.scr.boot.boot_failed', { reason: errorText(err) });
});

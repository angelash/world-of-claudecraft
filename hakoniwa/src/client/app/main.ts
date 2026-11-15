// Client entry: title screen, then one GameSession per running world. Loading a save
// replaces the session with one built on the resumed world. The game factory is loaded
// dynamically so a broken system module shows an error on the title screen instead of a
// blank page. Saves live in the save container over IndexedDB (release_engineering.md 5.2),
// in memory when the browser has none.

import '../client.css';
import { version as gameVersion } from '../../../package.json';
import type { Engine } from '../../core/engine';
import { ContainerBackend, MemoryStorage, runIdFromBytes, type SaveStorage } from '../../core/save';
import { IdbStorage } from '../../core/save/idb_storage';
import type { World } from '../../core/world';
import { fmt, T } from '../../shared_ui/text';
import {
  CLIENT_LOG_LIMIT,
  ClientSaves,
  type KeyValueStore,
  type LoadedSave,
  loadErrorText,
  loadNote,
  MemoryStore,
  type SlotId,
  slotLabel,
} from '../hud/save_slots';
import { createAdapters } from './adapters_wiring';
import { AiBridge } from './ai_bridge';
import { BootScreen } from './boot_screen';
import { parseConfig } from './config';
import { GameSession } from './session';

function storage(): KeyValueStore {
  try {
    const s = window.localStorage;
    const probe = '__hakoniwa_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return new MemoryStore();
  }
}

const WRITER_KEY = 'hakoniwa.saves.writer';

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** This browser's writer id for slot headers (5.3), kept across visits. */
function writerId(kv: KeyValueStore): string {
  const known = kv.getItem(WRITER_KEY);
  if (known && /^w-[0-9a-f]{8,32}$/.test(known)) return known;
  const id = `w-${randomHex(8)}`;
  try {
    kv.setItem(WRITER_KEY, id);
  } catch {
    // Not kept: the next visit picks another id, which only shows in the slot list.
  }
  return id;
}

async function saveStorage(): Promise<{ storage: SaveStorage; durable: boolean }> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const storage = await IdbStorage.open(indexedDB, { now: () => Date.now() });
      return { storage, durable: true };
    }
  } catch (err) {
    console.warn('[saves] IndexedDB unavailable; saves last until the page closes', err);
  }
  return { storage: new MemoryStorage({ now: () => Date.now() }), durable: false };
}

async function openSaves(kv: KeyValueStore): Promise<ClientSaves> {
  const now = () => Date.now();
  // renameVersion stays 0 until the rename table exists (PK-M0-18).
  const versions = { gameVersion, renameVersion: 0, build: import.meta.env.DEV ? 'dev' : 'web' };
  const { storage, durable } = await saveStorage();
  const backend = new ContainerBackend(storage, {
    now,
    writer: { id: writerId(kv), name: T.saves.writerBrowser },
    versions,
    // Another tab of the game may share the database: never share its temp files.
    tmpTag: randomHex(4),
  });
  const opened = new ClientSaves({
    backend,
    now,
    newRunId: () => runIdFromBytes(crypto.getRandomValues(new Uint8Array(8))),
    versions,
    legacy: kv,
    durable,
  });
  await opened.open();
  return opened;
}

const config = parseConfig(window.location.search, import.meta.env.DEV);
const root = document.getElementById('app') ?? document.body;
const store = storage();
let saves: ClientSaves;
const ai = new AiBridge(store);
void ai.probe();
document.title = T.app.title;

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
    greeting,
    loadWorld: (loaded: LoadedSave, line: string) =>
      void startWith(() => resume(loaded.world), loadedLine(line, loaded), loaded),
    toTitle: () => showTitle(),
  });
  ai.attach(engine);
  session.start();
  if (config.devMode) {
    // Console access for debugging in dev builds only.
    (window as unknown as { hakoniwa?: unknown }).hakoniwa = { session, engine };
  }
}

void openSaves(store).then((opened) => {
  saves = opened;
  showTitle();
  if (!saves.durable) boot?.setStatus(T.saves.memoryOnly);
});

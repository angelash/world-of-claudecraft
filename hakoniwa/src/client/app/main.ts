// Client entry: title screen, then one GameSession per running world. Loading a save
// replaces the session with one built on the resumed world. The game factory is loaded
// dynamically so a broken system module shows an error on the title screen instead of a
// blank page.

import '../client.css';
import type { Engine } from '../../core/engine';
import type { World } from '../../core/world';
import { fmt, T } from '../../shared_ui/text';
import {
  type KeyValueStore,
  MemoryStore,
  SaveStore,
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

const config = parseConfig(window.location.search, import.meta.env.DEV);
const root = document.getElementById('app') ?? document.body;
const store = storage();
const saves = new SaveStore(store);
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
          return createGame({ seed: seed ?? config.seed, aiMode: ai.mode() });
        }),
      load: (slot: SlotId) =>
        startWith(
          async () => {
            const world = saves.load(slot);
            if (!world) throw new Error(T.app.noSaves);
            return resume(world);
          },
          fmt(T.log.loaded, { slot: slotLabel(slot) }),
        ),
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
  return resumeGame(world, { aiMode: ai.mode() });
}

async function startWith(make: () => Promise<Engine>, greeting?: string): Promise<void> {
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
  session = new GameSession({
    engine,
    root,
    devMode: config.devMode,
    adapters: createAdapters(),
    saves,
    settings: ai,
    greeting,
    loadWorld: (world: World, line: string) => void startWith(() => resume(world), line),
    toTitle: () => showTitle(),
  });
  ai.attach(engine);
  session.start();
  if (config.devMode) {
    // Console access for debugging in dev builds only.
    (window as unknown as { hakoniwa?: unknown }).hakoniwa = { session, engine };
  }
}

showTitle();

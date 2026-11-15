// Connects the AI layer to running worlds: asks the dev proxy (GET /api/llm/status)
// whether a model is reachable, keeps the player's on/off setting, and runs one AiRunner
// attached to the current engine (rebound after loading). Worlds run with aiMode
// 'external' only when the setting is on and the proxy answered; otherwise 'off', and
// every request falls back to its rule (D-010).

import { AiRunner, NullProvider, ProxyProvider } from '../../ai';
import type { AiMode } from '../../core/ai_port';
import type { Engine } from '../../core/engine';
import { createRoleRegistry } from '../../game/ai_roles';
import type { KeyValueStore } from '../hud/save_slots';
import type { AiStatusView, ClientSettings } from '../windows/window_context';

const KEY = 'hakoniwa.settings.ai';
const PROBE_TIMEOUT_MS = 2500;

export class AiBridge implements ClientSettings {
  private readonly proxy = new ProxyProvider({ clock: { now: () => performance.now() } });
  private runner: AiRunner | null = null;
  private engine: Engine | null = null;
  private available = false;
  private probed: Promise<boolean> | null = null;

  constructor(private readonly store: KeyValueStore) {}

  /** Ask the proxy once (bounded by a timeout); later calls reuse the answer. */
  probe(): Promise<boolean> {
    if (!this.probed) {
      const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), PROBE_TIMEOUT_MS));
      const ask = this.proxy
        .status()
        .then((s) => s.available)
        .catch(() => false);
      this.probed = Promise.race([ask, timeout]).then((ok) => {
        this.available = ok;
        return ok;
      });
    }
    return this.probed;
  }

  get enabled(): boolean {
    return this.store.getItem(KEY) !== 'off';
  }

  /** aiMode for the next world. */
  mode(): AiMode {
    return this.enabled && this.available ? 'external' : 'off';
  }

  /** Drive this engine's AI requests (or stop when its world runs without a model). */
  attach(engine: Engine): void {
    this.engine = engine;
    if (engine.world.ai.mode !== 'external') {
      this.runner?.rebind(engine);
      return;
    }
    if (!this.runner) {
      this.runner = new AiRunner({
        engine,
        provider: this.available ? this.proxy : new NullProvider(),
        roles: createRoleRegistry(),
        clock: { now: () => performance.now() },
      });
      this.runner.attach();
    } else this.runner.rebind(engine);
  }

  ai(): AiStatusView {
    const st = this.runner?.status();
    return {
      enabled: this.enabled,
      available: this.available,
      active: this.engine?.world.ai.mode === 'external',
      level: st?.level ?? 0,
      budgetUsed: st?.budget.hourUsd,
      budgetCap: st?.budget.perHourUsd,
    };
  }

  setAiEnabled(on: boolean): void {
    this.store.setItem(KEY, on ? 'on' : 'off');
  }
}

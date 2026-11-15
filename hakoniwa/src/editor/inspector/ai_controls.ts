// The inspector's AI mode controls: off (fallbacks only) or external (an AiRunner with
// the dev proxy, a scripted mock for offline review, or no model), plus a status line.
// The settings apply when the inspector creates or imports a world. Thin DOM layer
// over audit/ai_setup.ts.

import type { AuditLog } from '../../ai/audit';
import type { Clock, HttpTransport } from '../../ai/contracts';
import type { AiRunner } from '../../ai/runner';
import type { ContentMap } from '../../core/contracts';
import type { Engine } from '../../core/engine';
import {
  chooseProvider,
  createRunner,
  type ProviderChoice,
  parseMockScript,
} from '../audit/ai_setup';
import { formatUsd } from '../audit/audit_model';
import { checkbox, h, select } from '../shell/dom';
import type { NoticeKind } from '../shell/tool';
import type { LiveGame, ProviderKind } from '../state/game_session';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';

export interface AiDeps {
  audit: AuditLog;
  clock: Clock;
  transport?: HttpTransport;
  baseUrl?: string;
}

export const DEFAULT_MOCK_SCRIPT = '[{"json": {"commands": []}}]';

/** Real ms per tick at a speed multiplier (20 ticks per second at 1x). */
export function msPerTickAt(speed: number): number {
  return 50 / Math.max(1, speed);
}

export class AiControls {
  mode: 'off' | 'external' = 'off';
  choice: ProviderChoice = 'auto';
  offline: 'mock' | 'null' = 'mock';
  mockText = DEFAULT_MOCK_SCRIPT;
  repeatLast = true;
  private speed = 1;
  private setMs: ((ms: number) => void) | null = null;

  constructor(
    private readonly deps: AiDeps,
    private readonly notify: (message: string, kind?: NoticeKind) => void,
  ) {}

  get aiMode(): 'off' | 'external' {
    return this.mode;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.setMs?.(msPerTickAt(speed));
  }

  /** A runner for a new engine, or null when the AI mode is off or the setup failed. */
  async make(
    engine: Engine,
    content: ContentMap,
  ): Promise<{ runner: AiRunner; provider: ProviderKind; note: string } | null> {
    this.setMs = null;
    if (this.mode !== 'external') return null;
    const script = parseMockScript(this.mockText);
    if (!script.ok) {
      this.notify(`${T.audit.mockBad}：${script.error}`, 'error');
      return null;
    }
    try {
      const pick = await chooseProvider(this.choice, {
        clock: this.deps.clock,
        transport: this.deps.transport,
        baseUrl: this.deps.baseUrl,
        offline: this.offline,
        mockScript: script.steps,
        repeatLast: this.repeatLast,
      });
      const made = createRunner({
        engine,
        content,
        provider: pick.provider,
        clock: this.deps.clock,
        audit: this.deps.audit,
        msPerTick: msPerTickAt(this.speed),
      });
      this.setMs = made.setMsPerTick;
      return { runner: made.runner, provider: pick.kind, note: pick.note };
    } catch (e) {
      this.notify(errorMessage(e), 'error');
      return null;
    }
  }

  render(onChange: () => void): HTMLElement {
    const modeSel = select(
      [
        { value: 'off', label: T.ai.modeOff },
        { value: 'external', label: T.ai.modeExternal },
      ],
      this.mode,
      (v) => {
        this.mode = v as 'off' | 'external';
        onChange();
      },
    );
    const providerSel = select(
      [
        { value: 'auto', label: T.ai.providerAuto },
        { value: 'proxy', label: T.ai.providerProxy },
        { value: 'mock', label: T.ai.providerMock },
        { value: 'null', label: T.ai.providerNull },
      ],
      this.choice,
      (v) => {
        this.choice = v as ProviderChoice;
      },
    );
    const offlineSel = select(
      [
        { value: 'mock', label: T.ai.providerMock },
        { value: 'null', label: T.ai.providerNull },
      ],
      this.offline,
      (v) => {
        this.offline = v as 'mock' | 'null';
      },
    );
    const area = h('textarea', { class: 'mono', rows: 4, value: this.mockText });
    area.addEventListener('input', () => {
      this.mockText = area.value;
    });
    const external = this.mode === 'external';
    return h(
      'div',
      { class: 'toolbar wrap ai-controls' },
      h('label', { class: 'check' }, T.ai.mode, modeSel),
      external ? h('label', { class: 'check' }, T.ai.provider, providerSel) : null,
      external ? h('label', { class: 'check' }, T.ai.offline, offlineSel) : null,
      external
        ? h(
            'details',
            { class: 'mock-script' },
            h('summary', { text: T.ai.mockScript }),
            h('p', { class: 'muted small', text: T.ai.mockHelp }),
            area,
            checkbox(T.ai.repeatLast, this.repeatLast, (v) => {
              this.repeatLast = v;
            }),
          )
        : null,
      h('span', { class: 'muted small', text: T.ai.applyHint }),
    );
  }

  statusText(game: LiveGame | null): string {
    if (!game?.runner) return T.ai.statusNone;
    const s = game.runner.status();
    const kind = {
      proxy: T.ai.providerProxy,
      mock: T.ai.providerMock,
      null: T.ai.providerNull,
    }[game.provider ?? 'null'];
    return fmt(T.ai.statusLine, {
      kind,
      note: game.providerNote,
      level: s.level,
      inFlight: s.inFlight,
      cost: formatUsd(s.budget.totalUsd),
    });
  }
}

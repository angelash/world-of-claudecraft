// Balance lab: batch combat duels (time to kill, damage per second, win rate), batch
// battlefield auto-resolve (win rate, casualties), and headless economy runs (price
// curves and the bankruptcy, wealth and blockage gates). Long runs advance in slices so
// the page stays responsive. Thin DOM layer over combat_sim.ts, war_sim.ts and
// econ_sim.ts.

import type { ContentMap, FlagValue } from '../../core/contracts';
import { Engine } from '../../core/engine';
import type { GameSystem } from '../../core/system';
import { t as renderText } from '../../shared_ui/i18n';
import { system as cityModule } from '../../systems/city';
import { system as economySystem } from '../../systems/economy';
import { system as inventorySystem } from '../../systems/inventory';
import { system as modifiersSystem } from '../../systems/modifiers';
import type { BattleTerrain } from '../../systems/warfare';
import { system as worldSystem } from '../../systems/world';
import { EDITOR_SOURCE } from '../inspector/inspector_model';
import { append, button, checkbox, clear, fill, h, select } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import { seedList } from '../util/stats';
import { type DuelResult, runDuel, summarizeDuels } from './combat_sim';
import {
  type EconomyReadings,
  EconomyRun,
  type EconomySample,
  economyReadings,
  gateVerdicts,
  type HolderGroup,
  holderGrouper,
  priceSeries,
} from './econ_sim';
import { type BattleSpec, parseForce, runBattles, summarizeBattles } from './war_sim';

type Tab = 'combat' | 'war' | 'economy';

const TERRAINS: BattleTerrain[] = [
  'plain',
  'road',
  'forest',
  'hill',
  'ford',
  'swamp',
  'snow',
  'dian',
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number, d = 1) => v.toFixed(d);

/** Yield to the browser between slices of work. */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export class BalanceTool implements EditorTool {
  readonly id = 'balance';
  readonly label = T.nav.balance;
  private host!: ToolHost;
  private ws!: Workspace;
  private tab: Tab = 'combat';
  private busy = false;
  private cancelled = false;
  // combat
  private fighter = 'player';
  private level = 5;
  private monster = '';
  private monsterLevel = '';
  private useAbilities = true;
  private seeds = 10;
  private baseSeed = 1;
  private maxSeconds = 120;
  // war
  private warMode: 'scenario' | 'field' = 'scenario';
  private scenario = '';
  private playerForce = '';
  private enemyForce = '';
  private terrain: BattleTerrain = 'plain';
  private playerLevel = 10;
  // economy
  private days = 5;
  private econSeeds = 2;
  private allSystems = false;
  private startFlags = '{}';
  private econSamples: EconomySample[][] = [];
  private econReadings: EconomyReadings | null = null;
  private priceKey = '';
  private tabsEl!: HTMLElement;
  private formEl!: HTMLElement;
  private outEl!: HTMLElement;

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.tabsEl = h('div', { class: 'tabs' });
    this.formEl = h('div', { class: 'balance-form' });
    this.outEl = h('div', { class: 'balance-out' });
    append(root, h('div', { class: 'balance-tool pane' }, this.tabsEl, this.formEl, this.outEl));
  }

  show(params: Record<string, string>): void {
    if (params.tab === 'combat' || params.tab === 'war' || params.tab === 'economy')
      this.tab = params.tab;
    this.renderTabs();
    this.renderForm();
  }

  hide(): void {
    this.cancelled = true;
  }

  private content(): ContentMap {
    return this.ws.content();
  }

  private renderTabs(): void {
    const tab = (id: Tab, label: string) =>
      button(
        label,
        () => {
          if (this.busy) return;
          this.tab = id;
          this.host.setParams({ tab: id });
          clear(this.outEl);
          this.renderTabs();
          this.renderForm();
        },
        { class: `tab${this.tab === id ? ' active' : ''}` },
      );
    fill(
      this.tabsEl,
      tab('combat', T.balance.tabCombat),
      tab('war', T.balance.tabWar),
      tab('economy', T.balance.tabEconomy),
    );
  }

  private numInput(value: number, set: (v: number) => void, min = 0): HTMLInputElement {
    const el = h('input', { type: 'number', value: String(value), min, class: 'num' });
    el.addEventListener('change', () => {
      const n = Number(el.value);
      if (Number.isFinite(n)) set(n);
    });
    return el;
  }

  private field(text: string, control: Node): HTMLElement {
    return h('label', { class: 'check' }, text, control);
  }

  private runButton(run: () => Promise<void>): HTMLElement {
    return h(
      'span',
      { class: 'inline' },
      button(this.busy ? T.balance.running : T.balance.run, () => void this.guard(run), {
        class: 'primary',
        disabled: this.busy,
      }),
      this.busy
        ? button(T.balance.cancel, () => {
            this.cancelled = true;
          })
        : null,
    );
  }

  private async guard(run: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.cancelled = false;
    this.renderForm();
    try {
      await run();
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    }
    this.busy = false;
    this.renderForm();
  }

  private renderForm(): void {
    clear(this.formEl);
    if (this.tab === 'combat') this.combatForm();
    else if (this.tab === 'war') this.warForm();
    else this.economyForm();
  }

  // -------------------------------------------------------------------------
  // Combat

  private combatForm(): void {
    const c = this.content();
    const classes = c.classes ?? [];
    // By level, narrow ranges first, so the default is not a 1-to-60 scaling monster.
    const monsters = [...(c.monsters ?? [])].sort(
      (a, b) => a.minLevel - b.minLevel || a.maxLevel - b.maxLevel || a.id.localeCompare(b.id),
    );
    if (!this.monster && monsters[0]) this.monster = monsters[0].id;
    const ml = h('input', { type: 'number', value: this.monsterLevel, class: 'num' });
    ml.addEventListener('change', () => {
      this.monsterLevel = ml.value.trim();
    });
    append(
      this.formEl,
      h(
        'div',
        { class: 'toolbar wrap' },
        this.field(
          T.balance.fighter,
          select(
            [
              { value: 'player', label: T.balance.fighterPlayer },
              ...classes.map((x) => ({ value: x.id, label: `${x.name}（${x.id}）` })),
            ],
            this.fighter,
            (v) => {
              this.fighter = v;
            },
          ),
        ),
        this.field(
          T.balance.level,
          this.numInput(
            this.level,
            (v) => {
              this.level = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.monster,
          select(
            monsters.map((m) => ({
              value: m.id,
              label: fmt(T.balance.monsterOption, {
                name: m.name,
                id: m.id,
                min: m.minLevel,
                max: m.maxLevel,
              }),
            })),
            this.monster,
            (v) => {
              this.monster = v;
            },
          ),
        ),
        this.field(T.balance.monsterLevel, ml),
        checkbox(T.balance.useAbilities, this.useAbilities, (v) => {
          this.useAbilities = v;
        }),
      ),
      h(
        'div',
        { class: 'toolbar wrap' },
        this.field(
          T.balance.seeds,
          this.numInput(
            this.seeds,
            (v) => {
              this.seeds = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.baseSeed,
          this.numInput(this.baseSeed, (v) => {
            this.baseSeed = v;
          }),
        ),
        this.field(
          T.balance.maxSeconds,
          this.numInput(
            this.maxSeconds,
            (v) => {
              this.maxSeconds = v;
            },
            1,
          ),
        ),
        this.runButton(() => this.runCombat()),
      ),
    );
  }

  private async runCombat(): Promise<void> {
    const content = this.content();
    const spec = {
      fighter: this.fighter,
      level: this.level,
      monsterId: this.monster,
      monsterLevel: this.monsterLevel ? Number(this.monsterLevel) : undefined,
      useAbilities: this.useAbilities,
      maxSeconds: this.maxSeconds,
    };
    const results: DuelResult[] = [];
    for (const seed of seedList(this.baseSeed, this.seeds)) {
      if (this.cancelled) break;
      results.push(runDuel(content, spec, seed));
      fill(this.outEl, `${T.balance.running} ${results.length} / ${this.seeds}`);
      await nextFrame();
    }
    const s = summarizeDuels(results);
    const b = T.balance;
    const outcome = {
      win: b.outcomeWin,
      loss: b.outcomeLoss,
      timeout: b.outcomeTimeout,
      error: b.outcomeError,
    };
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[b.colSeed, b.colOutcome, b.colSeconds, b.colDamage, b.colTaken, b.colHp].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const r of results) {
      table.append(
        h(
          'tr',
          { class: r.outcome === 'win' ? '' : 'has-problem' },
          h('td', { text: String(r.seed) }),
          h('td', { text: r.error ? `${outcome[r.outcome]}：${r.error}` : outcome[r.outcome] }),
          h('td', { text: num(r.seconds) }),
          h('td', { text: String(Math.round(r.fighterDamage)) }),
          h('td', { text: String(Math.round(r.monsterDamage)) }),
          h('td', { text: pct(r.fighterHpFrac) }),
        ),
      );
    }
    fill(
      this.outEl,
      h(
        'p',
        { class: 'summary' },
        fmt(b.duelSummary, {
          runs: s.runs,
          win: pct(s.winRate),
          loss: pct(s.lossRate),
          timeout: pct(s.timeoutRate),
          errors: s.errors,
          ttk: num(s.ttkMean),
          p50: num(s.ttkP50),
          p90: num(s.ttkP90),
          dps: num(s.dpsMean),
          mdps: num(s.monsterDpsMean),
          hp: pct(s.hpLeftMean),
        }),
      ),
      table,
    );
  }

  // -------------------------------------------------------------------------
  // Battlefield

  private warForm(): void {
    const c = this.content();
    const scenarios = c.battle_scenarios ?? [];
    if (!this.scenario && scenarios[0]) this.scenario = scenarios[0].id;
    const units = c.regiment_types ?? [];
    if (!this.playerForce && units[0]) this.playerForce = `${units[0].id} x 40`;
    if (!this.enemyForce && units[1]) this.enemyForce = `${units[1].id} x 40`;
    const pf = h('textarea', { class: 'mono', rows: 3, value: this.playerForce });
    pf.addEventListener('input', () => {
      this.playerForce = pf.value;
    });
    const ef = h('textarea', { class: 'mono', rows: 3, value: this.enemyForce });
    ef.addEventListener('input', () => {
      this.enemyForce = ef.value;
    });
    const field = this.warMode === 'field';
    append(
      this.formEl,
      h(
        'div',
        { class: 'toolbar wrap' },
        this.field(
          T.balance.warMode,
          select(
            [
              { value: 'scenario', label: T.balance.warScenario },
              { value: 'field', label: T.balance.warField },
            ],
            this.warMode,
            (v) => {
              this.warMode = v as 'scenario' | 'field';
              this.renderForm();
            },
          ),
        ),
        field
          ? this.field(
              T.balance.terrain,
              select(
                TERRAINS.map((t) => ({ value: t, label: t })),
                this.terrain,
                (v) => {
                  this.terrain = v as BattleTerrain;
                },
              ),
            )
          : this.field(
              T.balance.scenario,
              select(
                scenarios.map((s) => ({ value: s.id, label: `${s.name}（${s.id}）` })),
                this.scenario,
                (v) => {
                  this.scenario = v;
                },
              ),
            ),
        this.field(
          T.balance.playerLevel,
          this.numInput(
            this.playerLevel,
            (v) => {
              this.playerLevel = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.seeds,
          this.numInput(
            this.seeds,
            (v) => {
              this.seeds = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.baseSeed,
          this.numInput(this.baseSeed, (v) => {
            this.baseSeed = v;
          }),
        ),
        this.runButton(() => this.runWar()),
      ),
      field
        ? h(
            'div',
            { class: 'split2' },
            h('div', null, h('div', { class: 'sub-title', text: T.balance.playerForce }), pf),
            h('div', null, h('div', { class: 'sub-title', text: T.balance.enemyForce }), ef),
          )
        : null,
      field
        ? h('p', {
            class: 'muted small',
            text: `${T.balance.forceHelp} ${units.map((u) => u.id).join(', ')}`,
          })
        : null,
    );
  }

  private async runWar(): Promise<void> {
    const content = this.content();
    let spec: BattleSpec;
    if (this.warMode === 'scenario') spec = { kind: 'scenario', scenarioId: this.scenario };
    else {
      const p = parseForce(this.playerForce);
      const e = parseForce(this.enemyForce);
      if (!p.ok || !e.ok) {
        this.host.notify(
          fmt(T.balance.forceBad, { error: !p.ok ? p.error : !e.ok ? e.error : '' }),
          'error',
        );
        return;
      }
      spec = { kind: 'field', player: p.force, enemy: e.force, terrain: this.terrain };
    }
    const results = [];
    for (const seed of seedList(this.baseSeed, this.seeds)) {
      if (this.cancelled) break;
      results.push(...runBattles(content, spec, [seed], { playerLevel: this.playerLevel }));
      fill(this.outEl, `${T.balance.running} ${results.length} / ${this.seeds}`);
      await nextFrame();
    }
    const s = summarizeBattles(results);
    const b = T.balance;
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[b.colSeed, b.colVictor, b.colSeconds, b.colPlayerLoss, b.colEnemyLoss, b.colReason].map(
          (t) => h('th', { text: t }),
        ),
      ),
    );
    const seeds = seedList(this.baseSeed, this.seeds);
    results.forEach((r, i) => {
      const loss = (t: 'player' | 'enemy') => {
        const x = r.teams[t];
        return x.start > 0 ? pct((x.start - x.end) / x.start) : '';
      };
      table.append(
        h(
          'tr',
          { class: r.victor === 'player' ? '' : 'has-problem' },
          h('td', { text: String(seeds[i]) }),
          h('td', { text: r.victor }),
          h('td', { text: num(r.seconds) }),
          h('td', { text: loss('player') }),
          h('td', { text: loss('enemy') }),
          h('td', { text: renderText(r.reason) }),
        ),
      );
    });
    fill(
      this.outEl,
      h(
        'p',
        { class: 'summary' },
        fmt(b.warSummary, {
          runs: s.runs,
          win: pct(s.winRate),
          loss: pct(s.lossRate),
          draw: pct(s.drawRate),
          secs: num(s.meanSeconds),
          pl: pct(s.player.meanLossPct),
          pp: pct(s.player.p90LossPct),
          el: pct(s.enemy.meanLossPct),
          ep: pct(s.enemy.p90LossPct),
          heroes: pct(s.heroesDownRate),
        }),
      ),
      table,
    );
  }

  // -------------------------------------------------------------------------
  // Economy

  private economyForm(): void {
    const flags = h('input', { type: 'text', value: this.startFlags, class: 'mono wide' });
    flags.addEventListener('change', () => {
      this.startFlags = flags.value;
    });
    append(
      this.formEl,
      h(
        'div',
        { class: 'toolbar wrap' },
        this.field(
          T.balance.days,
          this.numInput(
            this.days,
            (v) => {
              this.days = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.seeds,
          this.numInput(
            this.econSeeds,
            (v) => {
              this.econSeeds = v;
            },
            1,
          ),
        ),
        this.field(
          T.balance.baseSeed,
          this.numInput(this.baseSeed, (v) => {
            this.baseSeed = v;
          }),
        ),
        select(
          [
            { value: 'economy', label: T.balance.systemsEconomy },
            { value: 'all', label: T.balance.systemsAll },
          ],
          this.allSystems ? 'all' : 'economy',
          (v) => {
            this.allSystems = v === 'all';
          },
        ),
        this.runButton(() => this.runEconomy()),
      ),
      h('div', { class: 'toolbar wrap' }, this.field(T.balance.startFlags, flags)),
    );
    if (this.econReadings && !this.busy) this.renderEconomy();
  }

  private async economySystems(): Promise<GameSystem[]> {
    if (!this.allSystems) {
      return [modifiersSystem, worldSystem, inventorySystem, economySystem, cityModule];
    }
    const reg = await import('../../game/registry');
    return reg.allSystems();
  }

  private async runEconomy(): Promise<void> {
    let flags: Record<string, FlagValue>;
    try {
      flags = JSON.parse(this.startFlags || '{}') as Record<string, FlagValue>;
      if (!flags || typeof flags !== 'object' || Array.isArray(flags)) throw new Error('object');
    } catch {
      this.host.notify(T.balance.startFlagsBad, 'error');
      return;
    }
    const content = this.content();
    const systems = await this.economySystems();
    const runs: EconomySample[][] = [];
    let grouper: ((owner: string) => HolderGroup) | null = null;
    for (const seed of seedList(this.baseSeed, this.econSeeds)) {
      if (this.cancelled) break;
      let engine: Engine;
      try {
        engine = Engine.create(seed, content, systems, { aiMode: 'off' });
      } catch (e) {
        this.host.notify(fmt(T.balance.econError, { message: errorMessage(e) }), 'error');
        return;
      }
      for (const [key, value] of Object.entries(flags))
        engine.queue('flag.set', { key, value }, EDITOR_SOURCE);
      engine.step(1);
      grouper ??= holderGrouper(engine.world, content);
      const run = new EconomyRun(engine, content, this.days);
      while (!run.done && !this.cancelled) {
        run.advance(3000);
        fill(
          this.outEl,
          fmt(T.balance.progress, {
            seed,
            day: Math.min(this.days, run.samples.length - 1),
            days: this.days,
          }),
        );
        await nextFrame();
      }
      runs.push(run.samples);
    }
    if (!grouper || runs.length === 0) return;
    this.econSamples = runs;
    this.econReadings = economyReadings(runs, grouper);
    this.priceKey = this.econReadings.prices[0]?.key ?? '';
    clear(this.outEl);
  }

  private renderEconomy(): void {
    const r = this.econReadings;
    if (!r) return;
    clear(this.outEl);
    const b = T.balance;
    const labelOf: Record<string, string> = {
      bankruptcy: fmt(b.gateBankrupt, { days: r.bankruptcy.tailDays }),
      'wealth.personal': `${b.gateWealth} | ${b.groupPersonal}`,
      'wealth.company': `${b.gateWealth} | ${b.groupCompany}`,
      'wealth.treasury': `${b.gateWealth} | ${b.groupTreasury}`,
      'blockage.mean': `${b.gateBlockage} | ${b.mean}`,
      'blockage.p90': `${b.gateBlockage} | P90`,
    };
    const asRate = (id: string) => id.startsWith('bankruptcy') || id.startsWith('blockage');
    const gates = h('table', { class: 'grid kv' });
    for (const g of gateVerdicts(r)) {
      const show = (v: number) => (asRate(g.id) ? pct(v) : `${num(v, 2)}x`);
      gates.append(
        h(
          'tr',
          { class: g.verdict === 'fail' ? 'has-problem' : '' },
          h('th', { text: labelOf[g.id] ?? g.id }),
          h('td', { text: g.verdict === 'nodata' ? b.gateNoData : show(g.value) }),
          h('td', { text: `${b.gateLimit} ${show(g.limit)}` }),
          h('td', {
            class: g.verdict === 'fail' ? 'bad' : g.verdict === 'pass' ? 'ok' : 'muted',
            text:
              g.verdict === 'pass' ? b.gatePass : g.verdict === 'fail' ? b.gateFail : b.gateNoData,
          }),
        ),
      );
    }
    gates.append(
      h(
        'tr',
        null,
        h('th', { text: b.groupNpc }),
        h('td', { text: r.wealth.npc.n ? `${num(r.wealth.npc.p90, 2)}x` : b.gateNoData }),
        h('td', { text: fmt(b.holders, { n: r.wealth.npc.n }) }),
        h('td'),
      ),
      h(
        'tr',
        null,
        h('th', { text: b.blockReasons }),
        h('td', { text: JSON.stringify(r.blockage.reasons) }),
        h('td'),
        h('td'),
      ),
    );
    append(this.outEl, h('div', { class: 'sub-title', text: b.readings }), gates);
    if (r.prices.length === 0) {
      this.outEl.append(h('p', { class: 'muted', text: b.noPrices }));
      return;
    }
    const chartBox = h('div', null);
    const drawChart = () =>
      fill(chartBox, priceChart(priceSeries(this.econSamples[0] ?? [], this.priceKey)));
    append(
      this.outEl,
      h('div', { class: 'sub-title', text: b.priceChart }),
      this.field(
        b.priceSeries,
        select(
          r.prices.map((p) => ({ value: p.key, label: p.key })),
          this.priceKey,
          (v) => {
            this.priceKey = v;
            drawChart();
          },
        ),
      ),
      chartBox,
    );
    drawChart();
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[b.colKey, b.colFirst, b.colLast, b.colMin, b.colMax, b.colDrift].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const p of r.prices.slice(0, 200)) {
      table.append(
        h(
          'tr',
          {
            class: Math.abs(p.drift) > 0.15 ? 'has-problem' : '',
            on: {
              click: () => {
                this.priceKey = p.key;
                this.renderEconomy();
              },
            },
          },
          h('td', { class: 'mono', text: p.key }),
          h('td', { text: String(p.first) }),
          h('td', { text: String(p.last) }),
          h('td', { text: String(p.min) }),
          h('td', { text: String(p.max) }),
          h('td', { text: pct(p.drift) }),
        ),
      );
    }
    append(this.outEl, h('div', { class: 'sub-title', text: b.priceTable }), table);
  }
}

/** A small line chart of one price series (day on x). */
function priceChart(values: number[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const w = 640;
  const hgt = 180;
  const pad = 30;
  const finite = values.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
  const y = (v: number) => hgt - pad - ((v - min) / span) * (hgt - pad * 2);
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(hgt));
  el.setAttribute('class', 'price-chart');
  const mk = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text) n.textContent = text;
    el.append(n);
  };
  mk('line', { x1: pad, y1: hgt - pad, x2: w - pad, y2: hgt - pad, stroke: '#3a3f49' });
  mk('line', { x1: pad, y1: pad, x2: pad, y2: hgt - pad, stroke: '#3a3f49' });
  mk('text', { x: 2, y: pad + 4, fill: '#9aa1ab', 'font-size': 10 }, String(max));
  mk('text', { x: 2, y: hgt - pad, fill: '#9aa1ab', 'font-size': 10 }, String(min));
  const pts = values
    .map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');
  mk('polyline', { points: pts, fill: 'none', stroke: '#5aa0ff', 'stroke-width': 2 });
  return el;
}

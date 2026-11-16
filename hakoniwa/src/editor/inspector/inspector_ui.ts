// World inspector: a headless game in the page (createGame, AI off or with an AiRunner),
// run at 1x to 100x or stepped, with views of the calendar, flags and variables
// (editable through flag.set), registered modifiers, entities, roles (NPC and goddess
// queries), the event stream, the command log, snapshot export and import, and
// determinism checks. The live game is published on the shared GameSession for the
// audit desk and the reveal review. Thin DOM layer over inspector_model.ts.

import type { AnyWorldEvent, CommandKind, ContentMap, WorldEvent } from '../../core/contracts';
import type { Engine } from '../../core/engine';
import { deserializeWorld, serializeWorld, worldHash } from '../../core/save';
import {
  calendarAt,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  TICKS_PER_GAME_MINUTE,
} from '../../core/time';
import type { World } from '../../core/world';
import {
  contentTextLookup,
  t as renderText,
  renderTextDeep,
  setContentText,
} from '../../shared_ui/i18n';
import { holdingOf } from '../../systems/inventory';
import type { ModifierSpec, ModifierTarget } from '../../systems/modifiers';
import type { Entity, EntityKind } from '../../systems/world/types';
import { npcIdForEntity } from '../roles/role_model';
import { RolesPanel } from '../roles/roles_panel';
import { append, button, checkbox, clear, downloadText, fill, h, select } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { GameSession } from '../state/game_session';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import type { AiControls } from './ai_controls';
import {
  EDITOR_SOURCE,
  type EntityFilter,
  externalInputs,
  type FlagType,
  filterEntities,
  flagRows,
  flagType,
  formatCalendar,
  hashText,
  parseCommandText,
  parseFlagInput,
  Ring,
  replayHash,
  runTwice,
  SPEEDS,
  selectEvents,
  sourceLabel,
  ticksForFrame,
} from './inspector_model';

type GameModule = typeof import('../../game/create');

type Tab =
  | 'overview'
  | 'flags'
  | 'modifiers'
  | 'entities'
  | 'roles'
  | 'events'
  | 'commands'
  | 'snapshot'
  | 'determinism';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: T.inspector.tabOverview },
  { id: 'flags', label: T.inspector.tabFlags },
  { id: 'modifiers', label: T.inspector.tabModifiers },
  { id: 'entities', label: T.inspector.tabEntities },
  { id: 'roles', label: T.roles.tab },
  { id: 'events', label: T.inspector.tabEvents },
  { id: 'commands', label: T.inspector.tabCommands },
  { id: 'snapshot', label: T.inspector.tabSnapshot },
  { id: 'determinism', label: T.inspector.tabDeterminism },
];

const ENTITY_KINDS: EntityKind[] = ['player', 'npc', 'monster', 'companion', 'object', 'unit'];
const MOD_TARGETS: ModifierTarget[] = [
  'price',
  'harvest',
  'production',
  'monster',
  'faith',
  'morale',
  'sediment',
  'xp',
  'travel',
];
const LIST_LIMIT = 300;
const PANEL_INTERVAL_MS = 250;

export class InspectorTool implements EditorTool {
  readonly id = 'inspector';
  readonly label = T.nav.inspector;
  private host!: ToolHost;
  private ws!: Workspace;
  private visible = false;
  private engine: Engine | null = null;
  /** Loaded lazily: a broken system module then only breaks this tool, not the workbench. */
  private game: GameModule | null = null;
  private loadError = '';
  private content: ContentMap | null = null;
  private seed = 20261115;
  private speed = 1;
  private running = false;
  private useDrafts = false;
  private imported = false;
  private unsubscribe: (() => void) | null = null;
  private readonly events = new Ring<AnyWorldEvent>(5000);
  private readonly results = new Ring<WorldEvent<'command.result'>>(1000);
  private readonly knownKinds = new Set<string>();
  private tab: Tab = 'overview';
  private entityFilter: EntityFilter = {};
  private selectedEntity = '';
  private eventKind = '';
  private eventText = '';
  private detTicks = 0;
  private detResult: HTMLElement | null = null;
  private hashShown = '';
  private raf = 0;
  private lastFrame = 0;
  private carry = 0;
  private lastPanel = 0;
  private creating = false;
  private readonly roles = new RolesPanel();
  private topEl!: HTMLElement;
  private aiEl!: HTMLElement;
  private aiStatusEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private panelEl!: HTMLElement;

  constructor(
    private readonly session: GameSession,
    private readonly ai: AiControls,
  ) {}

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.topEl = h('div', { class: 'toolbar wrap' });
    this.aiEl = h('div');
    this.aiStatusEl = h('div', { class: 'clock muted' });
    this.clockEl = h('div', { class: 'clock' });
    this.tabsEl = h('div', { class: 'tabs' });
    this.panelEl = h('div', { class: 'inspector-panel' });
    append(
      root,
      h(
        'div',
        { class: 'inspector-tool pane' },
        this.topEl,
        this.aiEl,
        this.clockEl,
        this.aiStatusEl,
        this.tabsEl,
        this.panelEl,
      ),
    );
    import('../../game/create')
      .then((mod) => {
        this.game = mod;
        void this.newWorld();
      })
      .catch((e: unknown) => {
        this.loadError = errorMessage(e);
        this.refreshAll();
      });
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    if (params.tab && TABS.some((t) => t.id === params.tab)) this.tab = params.tab as Tab;
    if (params.npc) this.roles.select('npc', params.npc);
    if (params.goddess) this.roles.select('goddess', params.goddess);
    this.renderAi();
    this.renderTop();
    this.renderTabs();
    this.renderClock();
    this.renderPanel();
    this.startLoop();
  }

  hide(): void {
    this.visible = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // -------------------------------------------------------------------------
  // World lifecycle

  private contentFor(): ContentMap {
    return this.useDrafts ? this.ws.content() : this.ws.baseContent;
  }

  private async attach(engine: Engine, content: ContentMap, imported: boolean): Promise<void> {
    // c.* keys in events and slices render with the workspace content this world runs on
    setContentText(contentTextLookup(content));
    const made = await this.ai.make(engine, content);
    this.session.set({
      engine,
      content,
      imported,
      runner: made?.runner ?? null,
      provider: made?.provider ?? null,
      providerNote: made?.note ?? '',
    });
    this.unsubscribe?.();
    this.engine = engine;
    this.content = content;
    this.imported = imported;
    this.events.clear();
    this.results.clear();
    this.knownKinds.clear();
    this.hashShown = '';
    this.detResult = null;
    for (const ev of engine.world.recent) this.record([ev]);
    this.unsubscribe = engine.onEvents((evs) => this.record(evs));
  }

  private record(evs: readonly AnyWorldEvent[]): void {
    this.events.push(...evs);
    for (const ev of evs) {
      this.knownKinds.add(ev.kind);
      if (ev.kind === 'command.result') this.results.push(ev as WorldEvent<'command.result'>);
    }
  }

  private async newWorld(): Promise<void> {
    const game = this.game;
    if (!game || this.creating) return;
    const content = this.contentFor();
    this.running = false;
    this.creating = true;
    this.refreshAll();
    try {
      const engine = game.createGame({ seed: this.seed, aiMode: this.ai.aiMode, content });
      await this.attach(engine, content, false);
    } catch (e) {
      this.engine = null;
      this.session.set(null);
      this.host.notify(`${T.inspector.createFailed}：${errorMessage(e)}`, 'error');
    }
    this.creating = false;
    this.refreshAll();
  }

  private async importWorld(text: string): Promise<void> {
    const game = this.game;
    if (!game) return;
    let world: World;
    try {
      world = deserializeWorld(text);
      const content = this.contentFor();
      await this.attach(game.resumeGame(world, { content, aiMode: this.ai.aiMode }), content, true);
      this.seed = world.meta.seed;
      this.running = false;
      this.host.notify(T.inspector.snapshotImported, 'ok');
    } catch (e) {
      this.host.notify(`${T.inspector.snapshotFailed}：${errorMessage(e)}`, 'error');
    }
    this.refreshAll();
  }

  private step(ticks: number): void {
    const engine = this.engine;
    if (!engine || ticks <= 0) return;
    try {
      engine.step(ticks);
    } catch (e) {
      this.running = false;
      this.host.notify(`${T.inspector.tickFailed}：${errorMessage(e)}`, 'error');
      this.renderTop();
    }
  }

  private startLoop(): void {
    if (this.raf || !this.visible) return;
    this.lastFrame = 0;
    this.carry = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (!this.visible) return;
    if (this.running) {
      const elapsed = this.lastFrame ? now - this.lastFrame : 0;
      const r = ticksForFrame(elapsed, this.speed, this.carry);
      this.carry = r.carry;
      this.step(r.ticks);
    }
    this.lastFrame = now;
    this.renderClock();
    if (this.running && now - this.lastPanel > PANEL_INTERVAL_MS) {
      this.lastPanel = now;
      this.renderPanel(true);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private queue(kind: string, data: unknown): void {
    if (!this.engine) return;
    this.engine.queue(kind as CommandKind, data as never, EDITOR_SOURCE);
    this.refreshAll();
  }

  // -------------------------------------------------------------------------
  // Top bar, clock, tabs

  private refreshAll(): void {
    if (!this.visible) return;
    this.renderTop();
    this.renderAi();
    this.renderClock();
    this.renderPanel();
  }

  private renderAi(): void {
    fill(
      this.aiEl,
      this.ai.render(() => this.renderAi()),
    );
  }

  private renderTop(): void {
    const seedIn = h('input', { type: 'number', value: String(this.seed), class: 'num' });
    seedIn.addEventListener('change', () => {
      const n = Number(seedIn.value);
      if (Number.isFinite(n)) this.seed = Math.trunc(n);
    });
    const speedSel = select(
      SPEEDS.map((s) => ({ value: String(s), label: `${s}x` })),
      String(this.speed),
      (v) => {
        this.speed = Number(v);
        this.ai.setSpeed(this.speed);
      },
    );
    fill(
      this.topEl,
      h('label', { class: 'check' }, T.inspector.seed, seedIn),
      button(T.inspector.newWorld, () => void this.newWorld(), { disabled: this.creating }),
      this.creating ? h('span', { class: 'muted', text: T.ai.creating }) : null,
      checkbox(T.inspector.useDrafts, this.useDrafts, (v) => {
        this.useDrafts = v;
      }),
      h('span', { class: 'sep' }),
      button(
        this.running ? T.inspector.pause : T.inspector.run,
        () => {
          this.running = !this.running;
          this.carry = 0;
          this.renderTop();
          this.renderPanel();
        },
        { class: 'primary', disabled: !this.engine },
      ),
      h('label', { class: 'check' }, T.inspector.speed, speedSel),
      button(T.inspector.step1, () => this.manualStep(1), { disabled: !this.engine }),
      button(T.inspector.stepMinute, () => this.manualStep(TICKS_PER_GAME_MINUTE), {
        disabled: !this.engine,
      }),
      button(T.inspector.stepHour, () => this.manualStep(TICKS_PER_GAME_HOUR), {
        disabled: !this.engine,
      }),
      button(T.inspector.stepDay, () => this.manualStep(TICKS_PER_GAME_DAY), {
        disabled: !this.engine,
      }),
    );
  }

  private manualStep(ticks: number): void {
    this.step(ticks);
    this.renderClock();
    this.renderPanel();
  }

  private renderClock(): void {
    const e = this.engine;
    this.aiStatusEl.textContent = e ? this.ai.statusText(this.session.game) : '';
    if (!e) {
      this.clockEl.textContent = '';
      return;
    }
    const w = e.world;
    const pending = w.inbox.length + w.queue.length;
    const weather = w.slices.world?.weather ?? '';
    this.clockEl.textContent = [
      `${T.common.tick} ${w.meta.tick}`,
      formatCalendar(calendarAt(w.meta.tick)),
      `${T.inspector.weather} ${weather}`,
      `${T.inspector.seed} ${w.meta.seed}${this.imported ? T.inspector.imported : ''}`,
      pending ? fmt(T.inspector.pendingCommands, { n: pending }) : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    for (const t of TABS) {
      this.tabsEl.append(
        button(
          t.label,
          () => {
            this.tab = t.id;
            this.host.setParams({ tab: t.id });
            this.renderTabs();
            this.renderPanel();
          },
          { class: `tab${t.id === this.tab ? ' active' : ''}` },
        ),
      );
    }
  }

  /** Periodic renders skip a panel the user is typing in, so inputs keep focus. */
  private renderPanel(periodic = false): void {
    if (periodic) {
      const active = document.activeElement;
      if (active && this.panelEl.contains(active) && active.matches('input, textarea, select'))
        return;
      if (this.tab === 'snapshot' || this.tab === 'determinism') return;
    }
    const e = this.engine;
    clear(this.panelEl);
    if (this.loadError) {
      this.panelEl.append(
        h('p', { class: 'bad', text: `${T.inspector.loadFailed}：${this.loadError}` }),
      );
      return;
    }
    if (!e) return;
    const panels: Record<Tab, (engine: Engine) => void> = {
      overview: (x) => this.renderOverview(x),
      flags: (x) => this.renderFlags(x),
      modifiers: (x) => this.renderModifiers(x),
      entities: (x) => this.renderEntities(x),
      roles: (x) =>
        this.roles.render(this.panelEl, x.world, this.content ?? x.content, () =>
          this.renderPanel(),
        ),
      events: () => this.renderEvents(),
      commands: (x) => this.renderCommands(x),
      snapshot: (x) => this.renderSnapshot(x),
      determinism: (x) => this.renderDeterminism(x),
    };
    panels[this.tab](e);
  }

  // -------------------------------------------------------------------------
  // Panels

  private renderOverview(e: Engine): void {
    const w = e.world;
    const entities = Object.keys(w.slices.world?.entities ?? {}).length;
    const rows: [string, string][] = [
      [T.inspector.calendar, formatCalendar(calendarAt(w.meta.tick))],
      [T.common.tick, String(w.meta.tick)],
      [T.inspector.entityCount, String(entities)],
      [T.inspector.tabFlags, String(Object.keys(w.meta.flags).length)],
      [T.inspector.tabModifiers, String(w.slices.modifiers?.active.length ?? 0)],
      [T.inspector.eventTotal, String(this.events.total)],
      [T.inspector.useDrafts, this.content === this.ws.baseContent ? T.common.no : T.common.yes],
    ];
    const table = h('table', { class: 'grid kv' });
    for (const [k, v] of rows)
      table.append(h('tr', null, h('th', { text: k }), h('td', { text: v })));
    const hashRow = h(
      'tr',
      null,
      h('th', { text: T.inspector.worldHash }),
      h('td', { text: this.hashShown }),
    );
    table.append(hashRow);
    const systems = h('table', { class: 'grid' });
    systems.append(
      h('tr', null, h('th', { text: T.common.id }), h('th', { text: T.inspector.systemOrder })),
    );
    for (const s of e.systems)
      systems.append(h('tr', null, h('td', { text: s.id }), h('td', { text: String(s.order) })));
    append(
      this.panelEl,
      table,
      button(T.inspector.worldHash, () => {
        this.hashShown = hashText(worldHash(e.world));
        this.renderPanel();
      }),
      h('div', { class: 'sub-title', text: T.inspector.systems }),
      systems,
    );
  }

  private renderFlags(e: Engine): void {
    const flags = flagRows(e.world.meta.flags);
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        h('th', { text: T.inspector.flagKey }),
        h('th', { text: T.common.value }),
        h('th', { text: T.common.type }),
        h('th', { text: '' }),
      ),
    );
    for (const { key, value } of flags) {
      const input = h('input', { type: 'text', value: String(value) });
      const typeSel = this.flagTypeSelect(flagType(value));
      table.append(
        h(
          'tr',
          null,
          h('td', { class: 'mono', text: key }),
          h('td', null, input),
          h('td', null, typeSel),
          h(
            'td',
            null,
            button(T.inspector.flagSet, () =>
              this.setFlag(key, input.value, typeSel.value as FlagType),
            ),
          ),
        ),
      );
    }
    const keyIn = h('input', { type: 'text', placeholder: T.inspector.flagKey });
    const valIn = h('input', { type: 'text', placeholder: T.common.value });
    const typeSel = this.flagTypeSelect('string');
    append(
      this.panelEl,
      flags.length ? table : h('p', { class: 'muted', text: T.inspector.flagNone }),
      h('div', { class: 'sub-title', text: T.inspector.flagAdd }),
      h(
        'div',
        { class: 'inline' },
        keyIn,
        valIn,
        typeSel,
        button(T.inspector.flagSet, () =>
          this.setFlag(keyIn.value.trim(), valIn.value, typeSel.value as FlagType),
        ),
      ),
    );
  }

  private flagTypeSelect(value: FlagType): HTMLSelectElement {
    return select(
      [
        { value: 'string', label: T.inspector.typeString },
        { value: 'number', label: T.inspector.typeNumber },
        { value: 'boolean', label: T.inspector.typeBoolean },
      ],
      value,
      () => {},
    );
  }

  private setFlag(key: string, raw: string, type: FlagType): void {
    if (!key) {
      this.host.notify(T.inspector.flagBadKey, 'error');
      return;
    }
    const r = parseFlagInput(raw, type);
    if (!r.ok) {
      this.host.notify(r.error, 'error');
      return;
    }
    this.queue('flag.set', { key, value: r.value });
  }

  private renderModifiers(e: Engine): void {
    const active = e.world.slices.modifiers?.active ?? [];
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[
          T.common.id,
          T.inspector.modTarget,
          T.inspector.modKey,
          T.inspector.modFactor,
          T.inspector.modAdd,
          T.inspector.modUntil,
          T.inspector.modSource,
          T.inspector.modVisibility,
          T.inspector.modNote,
        ].map((t) => h('th', { text: t })),
      ),
    );
    for (const m of active) {
      table.append(
        h(
          'tr',
          null,
          ...[
            m.id,
            m.target,
            m.key,
            String(m.factor ?? ''),
            String(m.add ?? ''),
            `${m.untilTick} (${m.untilTick - e.tick})`,
            m.source,
            m.visibility === 'public' ? T.inspector.modPublic : T.inspector.modHidden,
            renderText(m.note),
          ].map((t) => h('td', { text: t })),
        ),
      );
    }
    const target = select(
      MOD_TARGETS.map((t) => ({ value: t, label: t })),
      'price',
      () => {},
    );
    const key = h('input', { type: 'text', value: '*', placeholder: T.inspector.modKey });
    const factor = h('input', { type: 'number', step: 'any', value: '1', class: 'num' });
    const add = h('input', { type: 'number', step: 'any', value: '0', class: 'num' });
    const hours = h('input', { type: 'number', step: 'any', value: '24', class: 'num' });
    const vis = select(
      [
        { value: 'public', label: T.inspector.modPublic },
        { value: 'hidden', label: T.inspector.modHidden },
      ],
      'public',
      () => {},
    );
    const note = h('input', { type: 'text', placeholder: T.inspector.modNote });
    const form = h(
      'div',
      { class: 'inline wrap' },
      h('label', { class: 'check' }, T.inspector.modTarget, target),
      h('label', { class: 'check' }, T.inspector.modKey, key),
      h('label', { class: 'check' }, T.inspector.modFactor, factor),
      h('label', { class: 'check' }, T.inspector.modAdd, add),
      h('label', { class: 'check' }, T.inspector.modHours, hours),
      h('label', { class: 'check' }, T.inspector.modVisibility, vis),
      note,
      button(T.inspector.modRegister, () => {
        const spec: ModifierSpec = {
          target: target.value as ModifierTarget,
          key: key.value.trim() || '*',
          factor: Number(factor.value),
          add: Number(add.value),
          untilTick: e.tick + 1 + Math.round(Number(hours.value) * TICKS_PER_GAME_HOUR),
          source: 'editor',
          visibility: vis.value as 'public' | 'hidden',
          note: note.value,
        };
        this.queue('modifier.register', spec);
      }),
    );
    append(
      this.panelEl,
      active.length ? table : h('p', { class: 'muted', text: T.inspector.modNone }),
      h('div', { class: 'sub-title', text: T.inspector.modRegister }),
      form,
    );
  }

  private renderEntities(e: Engine): void {
    const all = Object.values(e.world.slices.world?.entities ?? {}) as Entity[];
    const maps = [
      ...new Set([...(this.content?.maps ?? []).map((m) => m.id), ...all.map((x) => x.mapId)]),
    ].sort();
    const mapSel = select(
      [{ value: '', label: T.common.all }, ...maps.map((m) => ({ value: m, label: m }))],
      this.entityFilter.mapId ?? '',
      (v) => {
        this.entityFilter.mapId = v || undefined;
        this.renderPanel();
      },
    );
    const kindSel = select(
      [{ value: '', label: T.common.all }, ...ENTITY_KINDS.map((k) => ({ value: k, label: k }))],
      this.entityFilter.kind ?? '',
      (v) => {
        this.entityFilter.kind = v || undefined;
        this.renderPanel();
      },
    );
    const text = h('input', {
      type: 'search',
      value: this.entityFilter.text ?? '',
      placeholder: T.inspector.entityFilter,
    });
    text.addEventListener('change', () => {
      this.entityFilter.text = text.value;
      this.renderPanel();
    });
    const list = filterEntities(all, this.entityFilter);
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[
          T.common.id,
          T.common.kind,
          T.common.name,
          T.inspector.entityMap,
          T.map.x,
          T.map.y,
          T.map.tags,
        ].map((t) => h('th', { text: t })),
      ),
    );
    for (const x of list.slice(0, LIST_LIMIT)) {
      table.append(
        h(
          'tr',
          {
            class: `${x.id === this.selectedEntity ? 'selected' : ''}${x.alive ? '' : ' dead'}`,
            on: {
              click: () => {
                this.selectedEntity = x.id;
                this.renderPanel();
              },
            },
          },
          ...[x.id, x.kind, x.name, x.mapId, x.x.toFixed(1), x.y.toFixed(1), x.tags.join(' ')].map(
            (t) => h('td', { text: t }),
          ),
        ),
      );
    }
    const sel = e.world.slices.world?.entities[this.selectedEntity];
    const detail = h('div', { class: 'detail' });
    if (sel) {
      const npcId = npcIdForEntity(e.world, sel.id);
      if (npcId) {
        detail.append(
          button(T.roles.showEntity, () => {
            this.roles.select('npc', npcId);
            this.tab = 'roles';
            this.host.setParams({ tab: 'roles', npc: npcId });
            this.renderTabs();
            this.renderPanel();
          }),
        );
      }
      detail.append(h('pre', { class: 'json', text: JSON.stringify(sel, null, 2) }));
      if (e.world.slices.inventory?.owners[sel.id]) {
        append(
          detail,
          h('div', { class: 'sub-title', text: T.inspector.entityHolding }),
          h('pre', { class: 'json', text: JSON.stringify(holdingOf(e.world, sel.id), null, 2) }),
        );
      }
    } else detail.append(h('p', { class: 'muted', text: T.inspector.entityPick }));
    append(
      this.panelEl,
      h(
        'div',
        { class: 'inline' },
        h('label', { class: 'check' }, T.inspector.entityMap, mapSel),
        h('label', { class: 'check' }, T.inspector.entityKind, kindSel),
        text,
      ),
      h(
        'div',
        { class: 'split2' },
        h(
          'div',
          { class: 'table-wrap' },
          list.length ? table : h('p', { class: 'muted', text: T.inspector.entityNone }),
        ),
        detail,
      ),
    );
  }

  private renderEvents(): void {
    const kinds = [...this.knownKinds].sort();
    const kindSel = select(
      [{ value: '', label: T.common.all }, ...kinds.map((k) => ({ value: k, label: k }))],
      this.eventKind,
      (v) => {
        this.eventKind = v;
        this.renderPanel();
      },
    );
    const text = h('input', {
      type: 'search',
      value: this.eventText,
      placeholder: T.inspector.eventFilter,
    });
    text.addEventListener('change', () => {
      this.eventText = text.value;
      this.renderPanel();
    });
    const shown = selectEvents(this.events.toArray(), this.eventKind, this.eventText, LIST_LIMIT);
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[T.common.tick, T.inspector.seq, T.inspector.eventKind, T.common.data].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const ev of shown) {
      table.append(
        h(
          'tr',
          null,
          h('td', { text: String(ev.tick) }),
          h('td', { text: String(ev.seq) }),
          h('td', { class: 'mono', text: ev.kind }),
          h('td', { class: 'mono small', text: JSON.stringify(renderTextDeep(ev.data)) }),
        ),
      );
    }
    append(
      this.panelEl,
      h(
        'div',
        { class: 'inline' },
        h('label', { class: 'check' }, T.inspector.eventKind, kindSel),
        text,
        button(T.inspector.eventClear, () => {
          this.events.clear();
          this.renderPanel();
        }),
        h('span', {
          class: 'muted small',
          text: fmt(T.inspector.eventShown, { shown: shown.length, total: this.events.size }),
        }),
      ),
      shown.length ? table : h('p', { class: 'muted', text: T.inspector.eventNone }),
    );
  }

  private renderCommands(e: Engine): void {
    const area = h('textarea', {
      class: 'mono',
      rows: 3,
      placeholder: T.inspector.commandPlaceholder,
    });
    const send = button(T.inspector.commandSend, () => {
      const r = parseCommandText(area.value);
      if (!r.ok) {
        this.host.notify(`${T.inspector.commandBad}：${r.error}`, 'error');
        return;
      }
      this.queue(r.kind, r.data);
    });
    const log = e.world.log.slice(-LIST_LIMIT).reverse();
    const logTable = h('table', { class: 'grid' });
    logTable.append(
      h(
        'tr',
        null,
        ...[T.common.tick, T.common.kind, T.common.source, T.common.data].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const l of log) {
      logTable.append(
        h(
          'tr',
          null,
          h('td', { text: String(l.tick) }),
          h('td', { class: 'mono', text: l.command.kind }),
          h('td', { text: sourceLabel(l.command.source) }),
          h('td', { class: 'mono small', text: JSON.stringify(l.command.data) }),
        ),
      );
    }
    const results = this.results.toArray().slice(-LIST_LIMIT).reverse();
    const resTable = h('table', { class: 'grid' });
    resTable.append(
      h(
        'tr',
        null,
        ...[T.common.tick, T.common.kind, T.common.message, T.common.source].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const r of results) {
      const d = r.data;
      resTable.append(
        h(
          'tr',
          { class: d.ok ? '' : 'has-problem' },
          h('td', { text: String(r.tick) }),
          h('td', { class: 'mono', text: d.kind }),
          h('td', {
            text: `${d.ok ? T.inspector.resultOk : T.inspector.resultRejected}${d.code ? ` ${d.code}` : ''}${d.reason ? `：${renderText(d.reason)}` : ''}`,
          }),
          h('td', { text: sourceLabel(d.source) }),
        ),
      );
    }
    append(
      this.panelEl,
      h('div', { class: 'sub-title', text: T.inspector.commandSend }),
      h('p', { class: 'muted small', text: T.inspector.commandHelp }),
      area,
      send,
      h(
        'div',
        { class: 'split2' },
        h(
          'div',
          null,
          h('div', {
            class: 'sub-title',
            text: `${T.inspector.commandLog}（${e.world.log.length}）`,
          }),
          log.length ? logTable : h('p', { class: 'muted', text: T.inspector.commandNone }),
        ),
        h(
          'div',
          null,
          h('div', { class: 'sub-title', text: T.inspector.commandResults }),
          results.length ? resTable : h('p', { class: 'muted', text: T.inspector.commandNone }),
        ),
      ),
    );
  }

  private renderSnapshot(e: Engine): void {
    const fileIn = h('input', { type: 'file', accept: '.json,application/json' });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files?.[0];
      if (f) void this.importWorld(await f.text());
    });
    const area = h('textarea', {
      class: 'mono',
      rows: 8,
      placeholder: T.inspector.snapshotTextarea,
    });
    append(
      this.panelEl,
      h('p', { class: 'muted', text: T.inspector.snapshotHelp }),
      h(
        'div',
        { class: 'inline' },
        button(
          T.inspector.snapshotExport,
          () => {
            const w = e.world;
            downloadText(`hakoniwa_world_${w.meta.seed}_${w.meta.tick}.json`, serializeWorld(w));
          },
          { class: 'primary' },
        ),
        button(T.common.copyText, () => {
          void navigator.clipboard
            ?.writeText(serializeWorld(e.world))
            .then(() => this.host.notify(T.common.copied, 'ok'));
        }),
      ),
      h('div', { class: 'sub-title', text: T.inspector.snapshotImport }),
      fileIn,
      area,
      button(T.inspector.snapshotImport, () => void this.importWorld(area.value)),
    );
  }

  private renderDeterminism(e: Engine): void {
    if (!this.detTicks) this.detTicks = Math.max(e.tick, TICKS_PER_GAME_HOUR);
    const ticksIn = h('input', {
      type: 'number',
      min: 1,
      value: String(this.detTicks),
      class: 'num',
    });
    ticksIn.addEventListener('change', () => {
      this.detTicks = Math.max(1, Math.trunc(Number(ticksIn.value) || 1));
    });
    const out = this.detResult ?? h('div', { class: 'det-result' });
    this.detResult = out;
    const run = button(
      T.inspector.detRun,
      () => {
        fill(out, T.inspector.detRunning);
        run.disabled = true;
        // Let the "running" text paint before the synchronous runs.
        setTimeout(() => {
          try {
            this.runDeterminism(e, out);
          } catch (err) {
            fill(out, h('p', { class: 'bad', text: errorMessage(err) }));
          }
          run.disabled = false;
        }, 30);
      },
      { class: 'primary' },
    );
    append(
      this.panelEl,
      h('p', { class: 'muted', text: T.inspector.detHelp }),
      h(
        'div',
        { class: 'inline' },
        h('label', { class: 'check' }, T.inspector.detTicks, ticksIn),
        run,
      ),
      out,
    );
  }

  private runDeterminism(e: Engine, out: HTMLElement): void {
    const content = this.content ?? this.ws.baseContent;
    const seed = e.world.meta.seed;
    const ticks = this.detTicks;
    const game = this.game;
    if (!game) return;
    const make = (s: number) =>
      game.createGame({ seed: s, aiMode: 'off', content, systems: [...e.systems] });
    const twice = runTwice(make, seed, ticks, externalInputs(e.world.log));
    const live = hashText(worldHash(e.world));
    const comparable = !this.imported && e.tick === ticks;
    const liveVsRuns = comparable && !this.session.game?.runner;
    const replay = comparable
      ? hashText(replayHash(seed, content, e.systems, e.world.log, ticks))
      : '';
    const verdict = (same: boolean) =>
      h('span', {
        class: same ? 'ok' : 'bad',
        text: same ? T.inspector.detSame : T.inspector.detDiff,
      });
    const table = h('table', { class: 'grid kv' });
    table.append(
      h(
        'tr',
        null,
        h('th', { text: T.inspector.detRunA }),
        h('td', { class: 'mono', text: hashText(twice.hashA) }),
      ),
      h(
        'tr',
        null,
        h('th', { text: T.inspector.detRunB }),
        h('td', { class: 'mono', text: hashText(twice.hashB) }),
        h('td', null, verdict(twice.same)),
      ),
    );
    if (comparable) {
      table.append(
        h(
          'tr',
          null,
          h('th', { text: T.inspector.detLive }),
          h('td', { class: 'mono', text: live }),
          liveVsRuns ? h('td', null, verdict(live === hashText(twice.hashA))) : null,
        ),
        h(
          'tr',
          null,
          h('th', { text: T.inspector.detReplay }),
          h('td', { class: 'mono', text: replay }),
          h('td', null, verdict(replay === live)),
        ),
      );
    }
    fill(
      out,
      table,
      comparable ? null : h('p', { class: 'muted small', text: T.inspector.detLiveNa }),
      comparable && !liveVsRuns
        ? h('p', { class: 'muted small', text: T.inspector.detAiNote })
        : null,
    );
  }
}

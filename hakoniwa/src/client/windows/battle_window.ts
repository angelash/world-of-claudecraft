// Battlefield window: the pending-battle prompt, the live grid battle drawn on a canvas,
// orders by mouse (left selects or moves, right attacks or moves), unit and hero orders,
// objectives, the battle log and the last result. All rules live in battle_model.ts; this
// file only builds DOM, draws and forwards adapter commands. The canvas is redrawn from
// frame() only when the world ticked, the selection or hover changed, or units are still
// gliding between kernel steps; text is written only when it changed.

import './battle.css';
import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import type { BattleView, Formation, HeroView, RegimentView } from '../../systems/warfare';
import { ctx2d, ensureSize, makeCanvas } from '../render/canvas_util';
import type { BattleAdapter, Commands } from '../view/adapters';
import {
  type AbilityButton,
  abilityButtons,
  abilityTargetMode,
  type BattleLayout,
  type BattleReport,
  canvasToGrid,
  drawOrder,
  findUnit,
  fitLayout,
  formationOptions,
  formationOrder,
  formationShape,
  heroColors,
  holdOrder,
  hpBar,
  isEnemyTarget,
  isOrderable,
  lastReport,
  lerpPos,
  localToGrid,
  logLines,
  moraleBar,
  OBJECTIVE_COLORS,
  objectiveSummaries,
  orderBlock,
  orderLine,
  outcomeText,
  type PosMap,
  pickUnit,
  planLines,
  regimentColors,
  reportLines,
  resolveClick,
  retreatOrder,
  SIDE_COLORS,
  sameLayout,
  scaleText,
  stepAlpha,
  type Targeting,
  TERRAIN_COLORS,
  terrainAtCell,
  terrainName,
  timeLine,
  unitDetail,
  unitSummary,
  validSelection,
} from './battle_model';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';
import { windowDef } from './window_registry';

/** Window body padding and borders around the canvas. */
const CANVAS_MAX_W = windowDef('battle').width - 34;
const CANVAS_VH = 0.5;
const CANVAS_MIN_H = 200;
const CANVAS_MAX_H = 600;
const LOG_LINES = 5;
const PING_MS = 500;
const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

type Mode = 'idle' | 'pending' | 'active';

export function battleWindow(ctx: WindowContext): WindowContent {
  const adapter = ctx.adapters.battle;
  if (!adapter) {
    return { el: el('p', { className: 'hk-muted hk-placeholder', text: T.windows.pendingPhase2 }) };
  }
  const panel = new BattlePanel(ctx, adapter);
  return {
    el: panel.root,
    update: () => panel.update(),
    frame: (now) => panel.frame(now),
    dispose: () => panel.dispose(),
  };
}

const show = (node: HTMLElement, on: boolean) => {
  if (node.hidden === on) node.hidden = !on;
};

const btn = (text: string, title: string, onClick: () => void, extra = '') =>
  el('button', {
    className: `hk-btn hk-btn-small${extra ? ` ${extra}` : ''}`,
    text,
    title,
    attrs: { type: 'button' },
    on: { click: onClick },
  });

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const setDisabled = (node: HTMLButtonElement | HTMLSelectElement, on: boolean) => {
  if (node.disabled !== on) node.disabled = on;
};

interface ObjectiveRow {
  row: HTMLElement;
  text: HTMLElement;
  fill: HTMLElement;
  bar: HTMLElement;
}

class BattlePanel {
  readonly root = el('div', { className: 'hk-bt' });

  // idle
  private idleBox = el('div', { className: 'hk-bt-idle' });
  private idleText = el('p', { className: 'hk-muted', text: T.battle.idle });
  private idleReport = el('div', { className: 'hk-bt-report' });
  private reportSig = '';
  private report: BattleReport | null = null;

  // pending
  private pendingBox = el('div', { className: 'hk-bt-pending' });
  private pendingTitle = el('h3', { className: 'hk-bt-pending-title' });
  private pendingScale = el('p', { className: 'hk-muted' });
  private pendingDesc = el('p', { className: 'hk-bt-pending-desc' });
  private pendingId = '';

  // active
  private activeBox = el('div', { className: 'hk-bt-active' });
  private headName = el('strong', { className: 'hk-bt-name' });
  private headTime = el('span', { className: 'hk-bt-time' });
  private headPlans = el('span', { className: 'hk-muted hk-bt-plans' });
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private hint = el('div', { className: 'hk-bt-hint hk-muted' });
  private detail = el('div', { className: 'hk-bt-detail' });
  private detailSig = '';
  private holdBtn: HTMLButtonElement;
  private retreatBtn: HTMLButtonElement;
  private deselectBtn: HTMLButtonElement;
  private formationLabel = el('label', { className: 'hk-bt-formation' });
  private formationSel = el('select', { className: 'hk-input hk-bt-select' });
  private formationKey = '';
  private abilityBox = el('div', { className: 'hk-bt-abilities' });
  private abilityList = el('div', { className: 'hk-bt-ability-list' });
  private abilityKey = '';
  private abilityBtns = new Map<string, HTMLButtonElement>();
  private objList = el('div', { className: 'hk-bt-obj-list' });
  private objKey: string | null = null;
  private objRows = new Map<string, ObjectiveRow>();
  private logList = el('div', { className: 'hk-bt-log-list' });
  private logSig: string | null = null;
  private outcomeEl = el('span', { className: 'hk-bt-outcome' });
  private retreatAllBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;

  // state
  private mode: Mode | null = null;
  private current: BattleView | null = null;
  private fetchedTick = -1;
  private selected: string | null = null;
  private inspected: string | null = null;
  private targeting: Targeting | null = null;
  private hoverPt: { x: number; y: number } | null = null;
  private hoverId: string | null = null;
  private layout: BattleLayout | null = null;
  private dpr = 1;
  private maxH = 400;
  private base: HTMLCanvasElement | null = null;
  private baseKey = '';
  private prevPos: PosMap | null = null;
  private snapAt = 0;
  private stepMs = 200;
  private lastNow = 0;
  private dirty = true;
  private gliding = false;
  private ping: { x: number; y: number; at: number; color: string } | null = null;

  constructor(
    private readonly ctx: WindowContext,
    private readonly adapter: BattleAdapter,
  ) {
    // idle
    this.idleBox.append(this.idleText, this.idleReport);

    // pending
    this.pendingBox.append(
      this.pendingTitle,
      this.pendingScale,
      this.pendingDesc,
      el('div', { className: 'hk-bt-actions' }, [
        el('button', {
          className: 'hk-btn hk-btn-primary',
          text: T.battle.start,
          attrs: { type: 'button' },
          on: { click: () => this.startPending() },
        }),
        el('button', {
          className: 'hk-btn',
          text: T.battle.autoResolve,
          title: T.battle.autoResolveTitle,
          attrs: { type: 'button' },
          on: { click: () => this.autoPending() },
        }),
      ]),
    );

    // active
    this.canvas = makeCanvas(1, 1);
    this.canvas.className = 'hk-bt-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', T.battle.canvasLabel);
    this.g = ctx2d(this.canvas);
    this.canvas.addEventListener('click', (ev) => this.onClick(ev, 'left'));
    this.canvas.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      this.onClick(ev, 'right');
    });
    this.canvas.addEventListener('pointermove', (ev) => this.onHover(ev));
    this.canvas.addEventListener('pointerleave', () => this.clearHover());

    this.holdBtn = btn(T.battle.hold, T.battle.holdTitle, () => this.orderSelected('hold'));
    this.retreatBtn = btn(T.battle.retreat, T.battle.retreatTitle, () =>
      this.orderSelected('retreat'),
    );
    this.deselectBtn = btn(T.battle.deselect, T.battle.deselect, () => this.select(null));
    this.formationSel.addEventListener('change', () => this.changeFormation());
    this.formationLabel.append(
      el('span', { className: 'hk-muted', text: T.battle.formation }),
      this.formationSel,
    );
    this.abilityBox.append(
      el('div', { className: 'hk-bt-subtitle hk-muted', text: T.battle.abilities }),
      this.abilityList,
    );
    this.retreatAllBtn = btn(
      T.battle.retreatAll,
      T.battle.retreatAllTitle,
      () => this.retreatAll(),
      'hk-bt-danger',
    );
    this.autoBtn = btn(T.battle.autoResolve, T.battle.autoResolveTitle, () => this.autoActive());

    this.activeBox.append(
      el('div', { className: 'hk-bt-head' }, [this.headName, this.headTime, this.headPlans]),
      el('div', { className: 'hk-bt-field' }, [this.canvas]),
      this.hint,
      el('div', { className: 'hk-bt-strip' }, [
        el('section', { className: 'hk-bt-col hk-bt-sel' }, [
          el('h3', { text: T.battle.selection }),
          this.detail,
          el('div', { className: 'hk-bt-orders' }, [
            this.holdBtn,
            this.retreatBtn,
            this.formationLabel,
            this.deselectBtn,
          ]),
          this.abilityBox,
        ]),
        el('section', { className: 'hk-bt-col' }, [
          el('h3', { text: T.battle.objectives }),
          this.objList,
        ]),
        el('section', { className: 'hk-bt-col' }, [el('h3', { text: T.battle.log }), this.logList]),
      ]),
      el('div', { className: 'hk-bt-foot' }, [this.outcomeEl, this.retreatAllBtn, this.autoBtn]),
    );

    this.root.append(this.idleBox, this.pendingBox, this.activeBox);
    this.idleBox.hidden = true;
    this.pendingBox.hidden = true;
    this.activeBox.hidden = true;
  }

  // -------------------------------------------------------------------------
  // refresh

  update(): void {
    this.maxH = clamp(Math.floor(window.innerHeight * CANVAS_VH), CANVAS_MIN_H, CANVAS_MAX_H);
    this.dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const b = this.fetch(true);
    if (b) {
      this.setMode('active');
      this.renderActive(b);
      return;
    }
    const pending = this.adapter.pending(this.ctx.view);
    if (pending) {
      this.setMode('pending');
      this.pendingId = pending.id;
      setText(this.pendingTitle, fmt(T.battle.pending, { name: pending.name }));
      setText(this.pendingScale, scaleText(pending.scale));
      setText(this.pendingDesc, pending.desc);
      return;
    }
    this.setMode('idle');
    this.report = lastReport(this.ctx.view.recentEvents()) ?? this.report;
    const lines = this.report ? reportLines(this.report) : [];
    const sig = lines.join('\n');
    if (sig !== this.reportSig) {
      this.reportSig = sig;
      clear(this.idleReport);
      for (const line of lines) this.idleReport.append(el('p', { text: line }));
    }
  }

  frame(nowMs: number): void {
    this.lastNow = nowMs;
    if (this.mode !== 'active') return;
    const b = this.fetch(false);
    if (!b) return;
    this.ensureLayout(b);
    const alpha = stepAlpha(nowMs, this.snapAt, this.stepMs);
    const pingLive = !!this.ping && nowMs - this.ping.at < PING_MS;
    // a ping that just expired still needs one frame to be wiped
    if (!this.dirty && !this.gliding && !this.ping) return;
    if (!pingLive) this.ping = null;
    this.gliding = alpha < 1 && this.prevPos !== null;
    this.dirty = false;
    this.draw(b, alpha, nowMs);
  }

  dispose(): void {
    this.base = null;
    this.current = null;
    this.prevPos = null;
  }

  /** Battle view for the current tick; a forced fetch reads it again even on the same tick. */
  private fetch(force: boolean): BattleView | null {
    const tick = this.ctx.view.tick;
    if (!force && tick === this.fetchedTick) return this.current;
    const prev = this.current;
    const b = this.adapter.battle(this.ctx.view);
    const changed =
      tick !== this.fetchedTick ||
      !b !== !prev ||
      (!!b && !!prev && (b.id !== prev.id || b.time !== prev.time));
    this.fetchedTick = tick;
    if (b && prev && b.id === prev.id && b.time !== prev.time) {
      // a kernel step: glide from where units are drawn now to the new positions
      const alpha = stepAlpha(this.lastNow, this.snapAt, this.stepMs);
      const from: PosMap = new Map();
      for (const r of prev.regiments) from.set(r.id, lerpPos(this.prevPos, r.id, r.x, r.y, alpha));
      for (const h of prev.heroes) from.set(h.id, lerpPos(this.prevPos, h.id, h.x, h.y, alpha));
      // learn the step interval (game speed) from consecutive steps, not across a pause
      const interval = this.lastNow - this.snapAt;
      if (this.prevPos && interval > 0 && interval < 1500) {
        this.stepMs = clamp(this.stepMs * 0.5 + interval * 0.5, 50, 1000);
      }
      this.prevPos = from;
      this.snapAt = this.lastNow;
      this.gliding = true;
    }
    if (!b || !prev || b.id !== prev.id) {
      this.selected = null;
      this.inspected = null;
      this.targeting = null;
      this.prevPos = null;
      this.baseKey = '';
    }
    if (b) {
      this.selected = validSelection(b, this.selected);
      if (this.targeting) {
        const h = b.heroes.find((x) => x.id === this.targeting?.heroId);
        if (!h || h.down || this.selected !== h.id) this.targeting = null;
      }
      if (this.inspected && !findUnit(b, this.inspected)) this.inspected = null;
    }
    this.current = b;
    if (changed) this.dirty = true;
    return b;
  }

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    show(this.idleBox, mode === 'idle');
    show(this.pendingBox, mode === 'pending');
    show(this.activeBox, mode === 'active');
    this.dirty = true;
  }

  private renderActive(b: BattleView): void {
    setText(this.headName, b.name);
    setText(this.headTime, timeLine(b));
    setText(this.headPlans, planLines(b).join('  '));
    this.renderSelection(b);
    this.renderHint(b);
    this.renderObjectives(b);
    const lines = logLines(b, LOG_LINES);
    const sig = lines.join('\n');
    if (sig !== this.logSig) {
      this.logSig = sig;
      clear(this.logList);
      if (lines.length === 0) {
        this.logList.append(el('div', { className: 'hk-muted', text: T.battle.noLog }));
      }
      for (const line of lines)
        this.logList.append(el('div', { className: 'hk-bt-log-line', text: line }));
    }
    setText(this.outcomeEl, outcomeText(b.outcome));
    const over = !!b.outcome;
    setDisabled(this.retreatAllBtn, over);
    setDisabled(this.autoBtn, over);
  }

  private renderSelection(b: BattleView): void {
    const sel = findUnit(b, this.selected);
    const shown = sel ?? findUnit(b, this.inspected);
    const lines = shown ? unitDetail(b, shown) : [T.battle.noSelection];
    const sig = lines.join('\n');
    if (sig !== this.detailSig) {
      this.detailSig = sig;
      clear(this.detail);
      for (const line of lines) this.detail.append(el('div', { text: line }));
    }
    const blocked = !sel || !!orderBlock(sel) || !!b.outcome;
    setDisabled(this.holdBtn, blocked);
    setDisabled(this.retreatBtn, blocked);
    setDisabled(this.deselectBtn, !sel);

    // formation selector (regiments only)
    const reg = sel?.kind === 'regiment' ? sel.unit : null;
    show(this.formationLabel, !!reg);
    const fkey = reg ? `${reg.id}|${reg.formations.join(',')}` : '';
    if (fkey !== this.formationKey) {
      this.formationKey = fkey;
      clear(this.formationSel);
      if (reg) {
        for (const o of formationOptions(reg)) {
          this.formationSel.append(el('option', { text: o.label, attrs: { value: o.value } }));
        }
      }
    }
    if (reg) {
      setDisabled(this.formationSel, blocked || reg.formations.length < 2);
      if (document.activeElement !== this.formationSel && this.formationSel.value !== reg.formation)
        this.formationSel.value = reg.formation;
    }

    // hero abilities
    const hero = sel?.kind === 'hero' ? sel.unit : null;
    show(this.abilityBox, !!hero);
    const buttons = hero ? abilityButtons(hero) : [];
    const akey = hero ? `${hero.id}|${buttons.map((a) => a.id).join(',')}` : '';
    if (akey !== this.abilityKey) {
      this.abilityKey = akey;
      clear(this.abilityList);
      this.abilityBtns.clear();
      for (const a of buttons) {
        const button = btn(a.label, a.title, () => this.useAbility(a.id));
        this.abilityBtns.set(a.id, button);
        this.abilityList.append(button);
      }
    }
    for (const a of buttons) {
      const button = this.abilityBtns.get(a.id);
      if (!button) continue;
      setText(button, a.label);
      if (button.title !== a.title) button.title = a.title;
      setDisabled(button, a.disabled || !!b.outcome);
      setClass(button, 'active', this.targeting?.abilityId === a.id);
    }
  }

  private renderHint(b: BattleView): void {
    let text = T.battle.controls;
    if (this.targeting) {
      text = fmt(T.battle.targeting, { name: this.targeting.name });
    } else if (this.hoverPt && this.layout) {
      const terrain = terrainName(
        terrainAtCell(b, Math.floor(this.hoverPt.x), Math.floor(this.hoverPt.y)),
      );
      const hit = findUnit(b, this.hoverId);
      text = hit
        ? fmt(T.battle.hoverUnit, { info: unitSummary(hit), terrain })
        : fmt(T.battle.hoverTerrain, { terrain });
    }
    setText(this.hint, text);
    setClass(this.canvas, 'hk-bt-aim', !!this.targeting);
  }

  private renderObjectives(b: BattleView): void {
    const list = objectiveSummaries(b);
    const key = list.map((o) => o.id).join('|');
    if (key !== this.objKey) {
      this.objKey = key;
      clear(this.objList);
      this.objRows.clear();
      if (list.length === 0) {
        this.objList.append(el('div', { className: 'hk-muted', text: T.battle.noObjectives }));
      }
      for (const o of list) {
        const text = el('div', { className: 'hk-bt-obj-text' });
        const fill = el('div', { className: 'hk-bt-obj-fill' });
        const bar = el('div', { className: 'hk-bt-obj-bar' }, [fill]);
        const row = el('div', { className: 'hk-bt-obj' }, [text, bar]);
        this.objRows.set(o.id, { row, text, fill, bar });
        this.objList.append(row);
      }
    }
    for (const o of list) {
      const r = this.objRows.get(o.id);
      if (!r) continue;
      setText(r.text, o.text);
      setClass(r.row, 'hk-bt-st-active', o.status === 'active');
      setClass(r.row, 'hk-bt-st-done', o.status === 'done');
      setClass(r.row, 'hk-bt-st-failed', o.status === 'failed');
      setClass(r.row, 'hk-bt-enemy', o.team === 'enemy');
      show(r.bar, o.frac !== null);
      const w = `${Math.round((o.frac ?? 0) * 100)}%`;
      if (r.fill.style.width !== w) r.fill.style.width = w;
    }
  }

  // -------------------------------------------------------------------------
  // input

  private gridPoint(ev: MouseEvent): { x: number; y: number } | null {
    const l = this.layout;
    if (!l) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = ((ev.clientX - rect.left) * l.width) / rect.width;
    const py = ((ev.clientY - rect.top) * l.height) / rect.height;
    return canvasToGrid(l, px, py);
  }

  private onClick(ev: MouseEvent, button: 'left' | 'right'): void {
    const b = this.current;
    const l = this.layout;
    const p = this.gridPoint(ev);
    if (!b || !l || !p || b.outcome) return;
    const act = resolveClick(b, l, this.selected, button, p.x, p.y, this.targeting);
    switch (act.kind) {
      case 'select':
        this.select(act.id);
        return;
      case 'inspect':
        this.inspected = act.id;
        break;
      case 'order': {
        this.queue(this.adapter.order(this.ctx.view, act.order));
        const o = act.order;
        const tgt = o.targetId ? findUnit(b, o.targetId) : null;
        const at = tgt ? { x: tgt.unit.x, y: tgt.unit.y } : { x: o.x ?? p.x, y: o.y ?? p.y };
        this.ping = { ...at, at: this.lastNow, color: o.kind === 'attack' ? '#ff8a78' : '#cfe0ff' };
        break;
      }
      case 'cast':
        this.queue(this.adapter.heroAbility(this.ctx.view, act.heroId, act.abilityId, act.target));
        this.ping = {
          x: act.target.x ?? p.x,
          y: act.target.y ?? p.y,
          at: this.lastNow,
          color: '#f2d78a',
        };
        this.targeting = null;
        break;
      case 'cancel':
        this.targeting = null;
        break;
      case 'none':
        return;
    }
    this.dirty = true;
    this.renderSelection(b);
    this.renderHint(b);
  }

  private onHover(ev: PointerEvent): void {
    const b = this.current;
    const p = this.gridPoint(ev);
    if (!b || !p) return;
    this.hoverPt = p;
    const hit = pickUnit(b, p.x, p.y, this.selected);
    const id = hit ? hit.unit.id : null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.dirty = true;
    }
    setClass(this.canvas, 'hk-bt-point', !!hit && (isOrderable(hit) || isEnemyTarget(hit)));
    this.renderHint(b);
  }

  private clearHover(): void {
    this.hoverPt = null;
    if (this.hoverId) this.dirty = true;
    this.hoverId = null;
    setClass(this.canvas, 'hk-bt-point', false);
    if (this.current) this.renderHint(this.current);
  }

  private select(id: string | null): void {
    this.selected = id;
    this.inspected = null;
    this.targeting = null;
    this.dirty = true;
    if (this.current) {
      this.renderSelection(this.current);
      this.renderHint(this.current);
    }
  }

  private queue(cmds: Commands): void {
    if (cmds.length > 0) this.ctx.commands.queueAll(cmds);
  }

  private orderSelected(kind: 'hold' | 'retreat'): void {
    const b = this.current;
    const sel = b ? findUnit(b, this.selected) : null;
    if (!b || !sel || orderBlock(sel)) return;
    const order = kind === 'hold' ? holdOrder(sel.unit.id) : retreatOrder(sel.unit.id);
    this.queue(this.adapter.order(this.ctx.view, order));
  }

  private changeFormation(): void {
    const b = this.current;
    const sel = b ? findUnit(b, this.selected) : null;
    if (!b || !sel || sel.kind !== 'regiment' || orderBlock(sel)) return;
    const f = this.formationSel.value as Formation;
    if (!sel.unit.formations.includes(f)) return;
    this.queue(this.adapter.order(this.ctx.view, formationOrder(sel.unit.id, f)));
  }

  private useAbility(abilityId: string): void {
    const b = this.current;
    const sel = b ? findUnit(b, this.selected) : null;
    if (!b || !sel || sel.kind !== 'hero') return;
    const a: AbilityButton | undefined = abilityButtons(sel.unit).find((x) => x.id === abilityId);
    if (!a || a.disabled) return;
    if (this.targeting?.abilityId === a.id) {
      this.targeting = null;
    } else if (abilityTargetMode(a.kind) === 'self') {
      this.targeting = null;
      this.queue(this.adapter.heroAbility(this.ctx.view, sel.unit.id, a.id, {}));
    } else {
      this.targeting = {
        heroId: sel.unit.id,
        abilityId: a.id,
        kind: a.kind,
        name: a.name,
        range: a.range,
      };
    }
    this.dirty = true;
    this.renderSelection(b);
    this.renderHint(b);
  }

  private retreatAll(): void {
    if (!this.current || this.current.outcome) return;
    if (!window.confirm(T.battle.confirmRetreatAll)) return;
    this.queue(this.adapter.retreat(this.ctx.view));
  }

  private autoActive(): void {
    const b = this.current;
    if (!b || b.outcome) return;
    if (!window.confirm(T.battle.confirmAutoResolve)) return;
    this.queue(this.adapter.autoResolve(this.ctx.view, b.scenarioId));
  }

  private startPending(): void {
    if (this.pendingId) this.queue(this.adapter.start(this.ctx.view, this.pendingId));
  }

  private autoPending(): void {
    if (this.pendingId) this.queue(this.adapter.autoResolve(this.ctx.view, this.pendingId));
  }

  // -------------------------------------------------------------------------
  // drawing

  private ensureLayout(b: BattleView): void {
    const l = fitLayout(b.width, b.height, CANVAS_MAX_W, this.maxH);
    const k = this.dpr;
    const resized = ensureSize(this.canvas, l.width * k, l.height * k);
    if (!sameLayout(this.layout, l) || resized) {
      this.layout = l;
      this.canvas.style.width = `${l.width}px`;
      this.canvas.style.height = `${l.height}px`;
      this.dirty = true;
    }
    const key = `${b.id}|${l.cell}|${k}|${b.width}x${b.height}`;
    if (key !== this.baseKey || !this.base) {
      this.baseKey = key;
      this.base = bakeTerrain(b, l, k);
      this.dirty = true;
    }
  }

  private draw(b: BattleView, alpha: number, nowMs: number): void {
    const l = this.layout;
    if (!l) return;
    const c = this.g;
    const cell = l.cell;
    const k = this.dpr;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 1;
    c.setLineDash([]);
    if (this.base) c.drawImage(this.base, 0, 0, l.width, l.height);
    else {
      c.fillStyle = '#101018';
      c.fillRect(0, 0, l.width, l.height);
    }
    const fs = clamp(Math.round(cell * 0.6), 9, 12);
    c.font = `${fs}px ${FONT}`;

    // display zones (multi-front battles)
    for (const z of b.zones) {
      c.strokeStyle = 'rgba(242, 215, 138, 0.45)';
      c.lineWidth = 1;
      c.setLineDash([2, 3]);
      c.strokeRect(
        z.rect.x * cell + 0.5,
        z.rect.y * cell + 0.5,
        z.rect.w * cell - 1,
        z.rect.h * cell - 1,
      );
      c.setLineDash([]);
      if (cell >= 8) label(c, z.name, z.rect.x * cell + 3, z.rect.y * cell + 2, '#f2d78a', 'left');
    }

    // objective zones
    for (const o of b.objectives) {
      if (!o.zone) continue;
      const color =
        o.team === 'enemy' && o.status === 'active' ? '#d4574a' : OBJECTIVE_COLORS[o.status];
      const x = o.zone.x * cell;
      const y = o.zone.y * cell;
      const w = o.zone.w * cell;
      const h = o.zone.h * cell;
      c.globalAlpha = 0.14;
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
      c.globalAlpha = 0.85;
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.setLineDash([]);
      c.globalAlpha = 1;
      if (cell >= 8) label(c, o.label, x + 4, y + h - fs - 3, color, 'left');
    }

    // retreat points
    drawFlag(c, b.retreat.player.x * cell, b.retreat.player.y * cell, SIDE_COLORS.player.fill, l);
    drawFlag(c, b.retreat.enemy.x * cell, b.retreat.enemy.y * cell, SIDE_COLORS.enemy.fill, l);

    const pos = (id: string, x: number, y: number) => lerpPos(this.prevPos, id, x, y, alpha);

    // order lines for the units the player leads
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    for (const r of b.regiments) {
      if (r.team !== 'player' || r.controller !== 'player' || r.state === 'gone') continue;
      const p = pos(r.id, r.x, r.y);
      this.drawOrderLine(c, orderLine(b, { ...r, ...p }, r.order), cell, r.id === this.selected);
    }
    c.setLineDash([]);

    const order = drawOrder(b, this.selected);
    for (const r of order.regiments) this.drawRegiment(c, r, pos(r.id, r.x, r.y), cell, fs);
    for (const h of order.heroes) this.drawHero(c, h, pos(h.id, h.x, h.y), cell, fs);

    // ability range while choosing a target
    if (this.targeting) {
      const h = b.heroes.find((x) => x.id === this.targeting?.heroId);
      if (h && this.targeting.range > 0) {
        const p = pos(h.id, h.x, h.y);
        c.strokeStyle = 'rgba(242, 215, 138, 0.8)';
        c.lineWidth = 1;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.arc(p.x * cell, p.y * cell, this.targeting.range * cell, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // click feedback
    if (this.ping) {
      const t = clamp((nowMs - this.ping.at) / PING_MS, 0, 1);
      const r = Math.round(3 + t * 6);
      c.globalAlpha = 1 - t;
      c.strokeStyle = this.ping.color;
      c.lineWidth = 2;
      c.strokeRect(
        Math.round(this.ping.x * cell) - r,
        Math.round(this.ping.y * cell) - r,
        r * 2,
        r * 2,
      );
      c.globalAlpha = 1;
    }
  }

  private drawOrderLine(
    c: CanvasRenderingContext2D,
    line: ReturnType<typeof orderLine>,
    cell: number,
    selected: boolean,
  ): void {
    if (!line) return;
    const color =
      line.kind === 'attack' ? '#ff8a78' : line.kind === 'retreat' ? '#e2b04a' : '#cfe0ff';
    c.globalAlpha = selected ? 0.95 : 0.4;
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(line.from.x * cell, line.from.y * cell);
    c.lineTo(line.to.x * cell, line.to.y * cell);
    c.stroke();
    c.fillStyle = color;
    c.fillRect(Math.round(line.to.x * cell) - 2, Math.round(line.to.y * cell) - 2, 4, 4);
    c.globalAlpha = 1;
  }

  private drawRegiment(
    c: CanvasRenderingContext2D,
    r: RegimentView,
    p: { x: number; y: number },
    cell: number,
    fs: number,
  ): void {
    const shape = formationShape(r.formation, r.count, r.radius);
    const col = regimentColors(r);
    const pip = clamp(Math.floor(shape.spacing * cell * 0.75), 2, Math.max(2, cell - 1));
    const frontD = shape.halfD - shape.spacing;
    const pts = shape.pips.map((q) => {
      const gp = localToGrid(p.x, p.y, r.facing, q.a, q.d);
      return {
        x: Math.round(gp.x * cell - pip / 2),
        y: Math.round(gp.y * cell - pip / 2),
        front: q.d >= frontD - 1e-6,
      };
    });
    c.globalAlpha = col.alpha;
    c.fillStyle = 'rgba(12, 10, 18, 0.9)';
    for (const q of pts) c.fillRect(q.x - 1, q.y - 1, pip + 2, pip + 2);
    for (const q of pts) {
      c.fillStyle = q.front ? col.edge : col.fill;
      c.fillRect(q.x, q.y, pip, pip);
    }
    c.globalAlpha = 1;

    const selected = r.id === this.selected;
    const hovered = r.id === this.hoverId;
    const inspected = r.id === this.inspected;
    if (selected || hovered || inspected) {
      const pad = 0.14;
      const corners = [
        localToGrid(p.x, p.y, r.facing, -shape.halfW - pad, -shape.halfD - pad),
        localToGrid(p.x, p.y, r.facing, shape.halfW + pad, -shape.halfD - pad),
        localToGrid(p.x, p.y, r.facing, shape.halfW + pad, shape.halfD + pad),
        localToGrid(p.x, p.y, r.facing, -shape.halfW - pad, shape.halfD + pad),
      ];
      c.strokeStyle = selected
        ? '#f2d78a'
        : this.targeting && isEnemyTarget({ kind: 'regiment', unit: r })
          ? '#ff8a78'
          : 'rgba(255, 255, 255, 0.7)';
      c.lineWidth = selected ? 2 : 1;
      if (inspected && !selected) c.setLineDash([3, 2]);
      c.beginPath();
      corners.forEach((q, i) => {
        if (i === 0) c.moveTo(q.x * cell, q.y * cell);
        else c.lineTo(q.x * cell, q.y * cell);
      });
      c.closePath();
      c.stroke();
      c.setLineDash([]);
    }

    // morale bar and head count under the block
    const ext = Math.hypot(shape.halfW, shape.halfD);
    const bw = clamp(Math.round(ext * 2 * cell * 0.8), 14, 40);
    const bh = cell >= 12 ? 3 : 2;
    const bx = Math.round(p.x * cell - bw / 2);
    const by = Math.round((p.y + ext) * cell) + 2;
    const m = moraleBar(r.morale);
    c.fillStyle = 'rgba(12, 10, 18, 0.85)';
    c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    c.fillStyle = m.color;
    c.fillRect(bx, by, Math.round(bw * m.frac), bh);
    if (cell >= 8)
      label(c, String(r.count), Math.round(p.x * cell), by + bh + 1, col.edge, 'center', fs);
  }

  private drawHero(
    c: CanvasRenderingContext2D,
    h: HeroView,
    p: { x: number; y: number },
    cell: number,
    fs: number,
  ): void {
    const col = heroColors(h);
    const hs = clamp(Math.round(cell * 0.45), 4, 9);
    const cx = Math.round(p.x * cell);
    const cy = Math.round(p.y * cell);
    const selected = h.id === this.selected;
    if (selected && !h.down && h.auraRadius > 0) {
      c.strokeStyle = 'rgba(242, 215, 138, 0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(cx, cy, h.auraRadius * cell, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = col.alpha;
    diamond(c, cx, cy, hs + 1, 'rgba(12, 10, 18, 0.95)');
    diamond(c, cx, cy, hs, col.edge);
    diamond(c, cx, cy, hs - 2, col.fill);
    c.fillStyle = col.edge;
    c.fillRect(cx - 1, cy - 1, 2, 2);
    c.globalAlpha = 1;
    if (selected || h.id === this.hoverId || h.id === this.inspected) {
      c.strokeStyle = selected
        ? '#f2d78a'
        : this.targeting && h.team === 'enemy'
          ? '#ff8a78'
          : 'rgba(255, 255, 255, 0.7)';
      c.lineWidth = selected ? 2 : 1;
      c.strokeRect(cx - hs - 3, cy - hs - 3, hs * 2 + 6, hs * 2 + 6);
    }
    // hp bar and name above the marker
    const bw = Math.max(16, hs * 2 + 4);
    const bx = cx - Math.round(bw / 2);
    const by = cy - hs - 6;
    const bar = hpBar(h.hp, h.maxHp);
    c.fillStyle = 'rgba(12, 10, 18, 0.85)';
    c.fillRect(bx - 1, by - 1, bw + 2, 4);
    c.fillStyle = h.down ? '#6c6870' : bar.color;
    c.fillRect(bx, by, Math.round(bw * bar.frac), 2);
    if (cell >= 10) label(c, h.name, cx, by - fs - 1, h.down ? '#a8a4ac' : '#f2d78a', 'center', fs);
  }
}

// ---------------------------------------------------------------------------
// drawing helpers

function label(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign,
  size?: number,
): void {
  if (size) c.font = `${size}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = 'top';
  c.fillStyle = 'rgba(10, 8, 14, 0.9)';
  c.fillText(text, x + 1, y + 1);
  c.fillStyle = color;
  c.fillText(text, x, y);
}

/** A pixel-crisp diamond built from one-pixel rows. */
function diamond(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  color: string,
): void {
  if (half <= 0) return;
  c.fillStyle = color;
  for (let i = -half; i <= half; i++) {
    const w = half - Math.abs(i);
    c.fillRect(cx - w, cy + i, w * 2 + 1, 1);
  }
}

function drawFlag(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  l: BattleLayout,
): void {
  const px = clamp(Math.round(x), 2, l.width - 10);
  const py = clamp(Math.round(y), 12, l.height - 1);
  c.fillStyle = 'rgba(12, 10, 18, 0.9)';
  c.fillRect(px - 1, py - 12, 3, 13);
  c.fillStyle = '#e8e0cc';
  c.fillRect(px, py - 11, 1, 11);
  c.fillStyle = color;
  for (let i = 0; i < 5; i++) c.fillRect(px + 1, py - 11 + i, 7 - i, 1);
  for (let i = 0; i < 4; i++) c.fillRect(px + 1, py - 6 + i, 3 + i, 1);
}

/** Terrain, a light per-terrain texture and a subtle grid, baked once per battle and size. */
function bakeTerrain(b: BattleView, l: BattleLayout, k: number): HTMLCanvasElement {
  const canvas = makeCanvas(l.width * k, l.height * k);
  const c = ctx2d(canvas);
  c.setTransform(k, 0, 0, k, 0, 0);
  const cell = l.cell;
  for (let ty = 0; ty < l.rows; ty++) {
    for (let tx = 0; tx < l.cols; tx++) {
      const t = terrainAtCell(b, tx, ty);
      const x = tx * cell;
      const y = ty * cell;
      c.fillStyle = TERRAIN_COLORS[t];
      c.fillRect(x, y, cell, cell);
      if ((tx + ty) % 2 === 0) {
        c.fillStyle = 'rgba(255, 255, 255, 0.03)';
        c.fillRect(x, y, cell, cell);
      }
      const q = Math.max(1, Math.floor(cell / 4));
      switch (t) {
        case 'forest':
          c.fillStyle = 'rgba(16, 36, 18, 0.55)';
          c.fillRect(x + q, y + q, q, q);
          c.fillRect(x + cell - 2 * q, y + cell - 2 * q, q, q);
          break;
        case 'hill':
          c.fillStyle = 'rgba(255, 240, 200, 0.18)';
          c.fillRect(x, y, cell, Math.max(1, q / 2));
          break;
        case 'building':
        case 'wall':
          c.fillStyle = 'rgba(0, 0, 0, 0.28)';
          c.fillRect(x + q / 2, y + q / 2, cell - q, cell - q);
          break;
        case 'water':
        case 'ford':
          c.fillStyle = 'rgba(220, 240, 255, 0.16)';
          c.fillRect(x + q, y + 2 * q, Math.max(1, 2 * q), 1);
          break;
        case 'dian':
          c.fillStyle = 'rgba(160, 140, 180, 0.18)';
          c.fillRect(x + 2 * q, y + q, 1, 1);
          break;
        default:
          break;
      }
    }
  }
  if (cell >= 8) {
    c.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let tx = 1; tx < l.cols; tx++) c.fillRect(tx * cell, 0, 1, l.height);
    for (let ty = 1; ty < l.rows; ty++) c.fillRect(0, ty * cell, l.width, 1);
  }
  return canvas;
}

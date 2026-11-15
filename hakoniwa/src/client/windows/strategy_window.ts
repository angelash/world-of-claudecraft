// Continent window (grand strategy): a canvas province graph beside a tabbed side panel
// (region, nation, diplomacy, wars and the conclave, chronicle). Reads only through the
// strategy adapter and acts only through its commands. The canvas is redrawn on a view or
// selection change (no animation loop); panes rebuild only when their own data changed,
// and inputs live in persistent nodes so a refresh never steals focus. Pure rules and
// texts live in strategy_model.ts.

import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import type { ContinentView, DiplomacyRow, NationView } from '../../systems/strategy';
import type { GameView } from '../view/game_view';
import './strategy.css';
import {
  type Army,
  armiesAt,
  armyDetail,
  armyLine,
  armyPathPoints,
  armyStatus,
  battleModeFrom,
  buildNames,
  canConvene,
  canRecruitIn,
  clampRecruit,
  conferenceText,
  continentSignature,
  type DiplomacyButton,
  diplomacyActions,
  diplomacyLines,
  foundingState,
  type InfoRow,
  isPlayerArmy,
  layoutMap,
  linkStyle,
  logLines,
  type MapLayout,
  type MoveTarget,
  moveTargets,
  type Names,
  nationRows,
  nodeFill,
  ownerColor,
  ownerColors,
  PLAYER,
  pendingText,
  pickAt,
  provinceMarks,
  provinceRows,
  provinceTooltip,
  recruitLimit,
  SG_COLORS,
  type SizeMode,
  shade,
  shortName,
  statusText,
  treatyName,
  warSummaries,
} from './strategy_model';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

const MAP_W = 540;
const MAP_H = 500;
const TAU = Math.PI * 2;
const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
/** updates (about four a second) an order acknowledgement stays visible */
const NOTICE_UPDATES = 24;

type Tab = 'region' | 'nation' | 'diplomacy' | 'affairs' | 'log';
const TABS: readonly Tab[] = ['region', 'nation', 'diplomacy', 'affairs', 'log'];

interface MapUi {
  selProvince: string | null;
  selArmy: string | null;
  hover: string | null;
  targets: MoveTarget[];
}

/** Toggle visibility only when it changed. */
function show(node: HTMLElement, on: boolean): void {
  if (node.hidden === on) node.hidden = !on;
}

function setDisabled(node: HTMLButtonElement | HTMLInputElement, off: boolean): void {
  if (node.disabled !== off) node.disabled = off;
}

function button(
  text: string,
  onClick: () => void,
  className = 'hk-btn hk-btn-small',
): HTMLButtonElement {
  return el('button', { className, text, attrs: { type: 'button' }, on: { click: onClick } });
}

function swatch(color: string): HTMLElement {
  const s = el('span', { className: 'hk-sg-swatch' });
  s.style.background = color;
  return s;
}

function infoTable(rows: readonly InfoRow[]): HTMLElement {
  return el(
    'dl',
    { className: 'hk-sg-info' },
    rows.flatMap((r) => [
      el('dt', { text: r.label }),
      el('dd', { className: r.tone ? `hk-sg-${r.tone}` : undefined }, [
        r.swatch ? swatch(r.swatch) : null,
        r.value,
      ]),
    ]),
  );
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

/** Paint the whole province graph. */
function drawMap(
  g: CanvasRenderingContext2D,
  layout: MapLayout,
  cv: ContinentView,
  ui: MapUi,
  dpr: number,
): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, layout.width, layout.height);
  g.fillStyle = SG_COLORS.bg;
  g.fillRect(0, 0, layout.width, layout.height);

  // faint survey grid every ten map units, on half pixels for crisp hairlines
  const t = layout.transform;
  g.lineWidth = 1;
  g.strokeStyle = SG_COLORS.grid;
  g.beginPath();
  for (let k = 0; k <= 100; k += 10) {
    const x = Math.round(t.ox + k * t.scale) + 0.5;
    const y = Math.round(t.oy + k * t.scale) + 0.5;
    if (x >= 0 && x <= layout.width) {
      g.moveTo(x, 0);
      g.lineTo(x, layout.height);
    }
    if (y >= 0 && y <= layout.height) {
      g.moveTo(0, y);
      g.lineTo(layout.width, y);
    }
  }
  g.stroke();

  // links
  g.lineCap = 'round';
  for (const l of cv.links) {
    const a = layout.byId.get(l.a);
    const b = layout.byId.get(l.b);
    if (!a || !b) continue;
    const st = linkStyle(l);
    g.setLineDash(st.dash);
    g.lineWidth = st.width;
    g.strokeStyle = st.color;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  g.setLineDash([]);

  // where the selected army may go next
  const army = ui.selArmy ? cv.armies.find((a) => a.id === ui.selArmy) : undefined;
  const from = army ? layout.byId.get(army.province) : undefined;
  if (from) {
    for (const tg of ui.targets) {
      const n = layout.byId.get(tg.id);
      if (!n) continue;
      g.lineWidth = 3;
      g.strokeStyle = tg.allowed ? SG_COLORS.reach : SG_COLORS.blocked;
      g.globalAlpha = tg.allowed ? 0.75 : 0.4;
      g.beginPath();
      g.moveTo(from.x, from.y);
      g.lineTo(n.x, n.y);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // army marches
  for (const a of cv.armies) {
    const pts = armyPathPoints(layout, a);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!first || !last) continue;
    const mine = a.owner === PLAYER;
    g.setLineDash(mine ? [6, 3] : [3, 3]);
    g.lineWidth = mine ? 2 : 1.25;
    g.strokeStyle = mine ? SG_COLORS.pathPlayer : SG_COLORS.path;
    g.beginPath();
    g.moveTo(first.x, first.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.stroke();
    g.setLineDash([]);
    ring(g, last.x, last.y, 3);
    g.fillStyle = mine ? SG_COLORS.pathPlayer : SG_COLORS.path;
    g.fill();
  }

  // provinces
  const colors = ownerColors(cv);
  const targetOf = new Map(ui.targets.map((x) => [x.id, x]));
  for (const p of cv.provinces) {
    const n = layout.byId.get(p.id);
    if (!n) continue;
    const m = provinceMarks(cv, p, colors);
    if (m.war !== 'none') {
      ring(g, n.x, n.y, n.r + 2.5);
      g.setLineDash(m.war === 'player' ? [] : [2, 2]);
      g.lineWidth = m.war === 'player' ? 2 : 1;
      g.strokeStyle = SG_COLORS.war;
      g.stroke();
      g.setLineDash([]);
    }
    ring(g, n.x, n.y, n.r);
    g.fillStyle = nodeFill(p);
    g.fill();
    g.setLineDash(m.impassable ? [3, 2] : []);
    g.lineWidth = 1.5;
    g.strokeStyle = m.impassable ? SG_COLORS.impassableEdge : shade(p.color, 0.55);
    g.stroke();
    g.setLineDash([]);
    if (m.capital) {
      ring(g, n.x, n.y, Math.max(2, n.r * 0.38));
      g.fillStyle = SG_COLORS.gold;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = SG_COLORS.outline;
      g.stroke();
    }
    if (m.siege) {
      ring(g, n.x, n.y, n.r + 4.5);
      g.lineWidth = 3;
      g.strokeStyle = SG_COLORS.outline;
      g.stroke();
      g.beginPath();
      g.arc(n.x, n.y, n.r + 4.5, -Math.PI / 2, -Math.PI / 2 + (TAU * m.siege.progress) / 100);
      g.strokeStyle = m.siege.color;
      g.stroke();
    }
    for (let i = 0; i < m.dian; i++) {
      const ang = Math.PI * (0.62 + i * 0.13);
      ring(g, n.x + Math.cos(ang) * (n.r + 5), n.y + Math.sin(ang) * (n.r + 5), 1.8);
      g.fillStyle = SG_COLORS.dian;
      g.fill();
    }
    const tg = targetOf.get(p.id);
    if (tg) {
      ring(g, n.x, n.y, n.r + (m.siege ? 9 : 6));
      g.setLineDash(tg.allowed ? [4, 2] : [2, 3]);
      g.lineWidth = 2;
      g.strokeStyle = tg.allowed ? SG_COLORS.reach : SG_COLORS.blocked;
      g.stroke();
      g.setLineDash([]);
    }
    if (p.id === ui.selProvince) {
      ring(g, n.x, n.y, n.r + (m.siege ? 8 : 5));
      g.lineWidth = 2.5;
      g.strokeStyle = SG_COLORS.select;
      g.stroke();
    } else if (p.id === ui.hover) {
      ring(g, n.x, n.y, n.r + 3.5);
      g.lineWidth = 1.5;
      g.strokeStyle = SG_COLORS.hover;
      g.stroke();
    }
  }

  // labels
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  for (const p of cv.provinces) {
    const n = layout.byId.get(p.id);
    if (!n) continue;
    const text = shortName(p.name);
    const y = n.y + n.r + 4;
    g.font = p.capitalOf ? `bold 12px ${FONT}` : `12px ${FONT}`;
    g.lineWidth = 3;
    g.strokeStyle = SG_COLORS.labelStroke;
    g.strokeText(text, n.x, y);
    g.fillStyle = p.impassable
      ? SG_COLORS.labelMuted
      : p.owner === PLAYER
        ? SG_COLORS.labelPlayer
        : SG_COLORS.label;
    g.fillText(text, n.x, y);
  }

  // army tokens (player armies: gold rim; engaged: red rim)
  for (const tk of layout.tokens) {
    const x0 = Math.round(tk.x - tk.size / 2);
    const y0 = Math.round(tk.y - tk.size / 2);
    g.fillStyle = ownerColor(colors, tk.owner);
    g.fillRect(x0, y0, tk.size, tk.size);
    g.lineWidth = tk.player ? 2 : 1;
    g.strokeStyle = tk.frozen ? SG_COLORS.war : tk.player ? SG_COLORS.gold : SG_COLORS.tokenEdge;
    const o = tk.player ? 0 : 0.5;
    g.strokeRect(x0 + o, y0 + o, tk.size - 2 * o, tk.size - 2 * o);
    if (tk.armyId === ui.selArmy) {
      g.lineWidth = 1.5;
      g.strokeStyle = SG_COLORS.tokenSelected;
      g.strokeRect(x0 - 3, y0 - 3, tk.size + 6, tk.size + 6);
    }
  }
}

export function strategyWindow(ctx: WindowContext): WindowContent {
  const S = T.strategy;

  // ---- state
  let tab: Tab = 'region';
  let sizeMode: SizeMode = 'population';
  let selProvince: string | null = null;
  let selArmy: string | null = null;
  let hover: string | null = null;
  let notice = '';
  let noticeAge = 0;
  let cv: ContinentView | null = null;
  let nation: NationView | null = null;
  let rows: DiplomacyRow[] = [];
  let names: Names = buildNames({ provinces: [], armies: [] });
  let layout: MapLayout | null = null;
  let mapSig = '';
  let hoverKey = '';
  let recruitSig = '';
  const paneSig: Record<Tab, string> = {
    region: '',
    nation: '',
    diplomacy: '',
    affairs: '',
    log: '',
  };

  const adapter = () => ctx.adapters.strategy;
  const view = (): GameView => ctx.view;

  const say = (text: string) => {
    notice = text;
    noticeAge = 0;
  };

  // ---- the window's states
  const placeholder = el('p', {
    className: 'hk-muted hk-placeholder',
    text: T.windows.pendingPhase2,
  });
  const inactive = el('div', { className: 'hk-sg-inactive' }, [
    el('h3', { text: S.inactive }),
    el('p', { className: 'hk-muted', text: S.inactiveHint }),
  ]);

  // founding (persistent nodes: the name survives refreshes)
  const foundName = el('input', {
    className: 'hk-input',
    attrs: { type: 'text', maxlength: '24', placeholder: S.foundName, 'aria-label': S.foundName },
  });
  const foundRow = el('div', { className: 'hk-row' }, [
    foundName,
    button(S.foundButton, () => onFound(), 'hk-btn hk-btn-primary'),
  ]);
  const foundReason = el('p', { className: 'hk-sg-reason' });
  const foundBox = el('div', { className: 'hk-sg-found' }, [
    el('h3', { text: S.foundTitle }),
    el('p', { className: 'hk-muted hk-sg-small', text: S.foundIntro }),
    foundReason,
    foundRow,
  ]);
  const orderNote = el('p', { className: 'hk-sg-order', attrs: { role: 'status' } });

  // header
  const status = el('span', { className: 'hk-sg-status' });
  const pendingLine = el('span');
  const pendingBox = el('div', { className: 'hk-sg-pending' }, [
    pendingLine,
    button(S.openBattle, () => ctx.actions.openWindow('battle')),
  ]);
  const header = el('div', { className: 'hk-sg-header' }, [status, pendingBox]);

  // map
  const canvas = el('canvas', {
    className: 'hk-sg-canvas',
    attrs: { role: 'img', 'aria-label': S.mapLabel },
  });
  canvas.style.width = `${MAP_W}px`;
  canvas.style.height = `${MAP_H}px`;
  const g = canvas.getContext('2d');
  const sizeBtns: Record<SizeMode, HTMLButtonElement> = {
    population: button(S.sizePopulation, () => setSize('population')),
    garrison: button(S.sizeGarrison, () => setSize('garrison')),
  };
  const mapCol = el('div', { className: 'hk-sg-mapcol' }, [
    canvas,
    el('div', { className: 'hk-sg-mapfoot' }, [
      el('span', { className: 'hk-muted hk-sg-hint', text: S.mapHint }),
      el('span', { className: 'hk-sg-size' }, [
        el('span', { className: 'hk-muted', text: S.sizeBy }),
        sizeBtns.population,
        sizeBtns.garrison,
      ]),
    ]),
  ]);

  // side panel
  const tabBtns = new Map<Tab, HTMLButtonElement>();
  const tabBar = el(
    'div',
    { className: 'hk-sg-tabs', attrs: { role: 'tablist' } },
    TABS.map((t) => {
      const b = el('button', {
        className: 'hk-sg-tab',
        text: S.tabs[t] ?? t,
        attrs: { type: 'button', role: 'tab' },
        on: { click: () => setTab(t) },
      });
      tabBtns.set(t, b);
      return b;
    }),
  );

  // region pane: rebuilt info plus a persistent recruit form
  const regionInfo = el('div');
  const recruitType = el('select', {
    className: 'hk-input',
    attrs: { 'aria-label': S.recruitType },
  });
  const recruitCount = el('input', {
    className: 'hk-input hk-sg-count',
    attrs: { type: 'number', min: '1', step: '1', value: '100', 'aria-label': S.recruitCount },
  });
  const recruitBtn = button(S.recruitButton, () => onRecruit());
  const recruitNote = el('p', { className: 'hk-muted hk-sg-small' });
  const recruitBox = el('div', { className: 'hk-sg-recruit' }, [
    el('h3', { text: S.recruitTitle }),
    el('div', { className: 'hk-row' }, [recruitType, recruitCount, recruitBtn]),
    recruitNote,
  ]);

  // affairs pane: rebuilt war list, persistent controls
  const warList = el('div');
  const confLine = el('p', { className: 'hk-sg-small' });
  const conveneBtn = button(S.convene, () => onConvene());
  const modeBtns = {
    auto: button(S.battleAuto, () => onMode('auto')),
    manual: button(S.battleManual, () => onMode('manual')),
  };
  const pendingAffairs = el('p', { className: 'hk-sg-small' });
  const affairsBattleBtn = button(S.openBattle, () => ctx.actions.openWindow('battle'));

  const panes: Record<Tab, HTMLElement> = {
    region: el('div', { className: 'hk-sg-pane' }, [regionInfo, recruitBox]),
    nation: el('div', { className: 'hk-sg-pane' }),
    diplomacy: el('div', { className: 'hk-sg-pane' }),
    affairs: el('div', { className: 'hk-sg-pane' }, [
      el('h3', { text: S.wars }),
      warList,
      el('h3', { text: S.conference }),
      confLine,
      el('div', { className: 'hk-row' }, [conveneBtn]),
      el('h3', { text: S.battleMode }),
      el('div', { className: 'hk-sg-modes' }, [modeBtns.auto, modeBtns.manual]),
      el('p', { className: 'hk-muted hk-sg-small', text: S.battleModeHint }),
      el('h3', { text: S.pendingTitle }),
      pendingAffairs,
      el('div', { className: 'hk-row' }, [affairsBattleBtn]),
    ]),
    log: el('div', { className: 'hk-sg-pane' }),
  };
  const side = el('div', { className: 'hk-sg-side' }, [
    tabBar,
    el(
      'div',
      { className: 'hk-sg-panes' },
      TABS.map((t) => panes[t]),
    ),
  ]);

  const main = el('div', { className: 'hk-sg-main' }, [
    header,
    el('div', { className: 'hk-sg-grid' }, [mapCol, side]),
  ]);
  const body = el('div', { className: 'hk-sg-body' }, [foundBox, orderNote, inactive, main]);
  const root = el('div', { className: 'hk-sg-root' }, [placeholder, body]);

  // ---- actions
  function onFound(): void {
    const a = adapter();
    if (!a) return;
    const name = foundName.value.trim();
    ctx.commands.queueAll(a.foundNation(view(), name || undefined));
    say(S.foundOrdered);
    update();
  }

  function orderMove(armyId: string, to: string): void {
    const a = adapter();
    const army = cv?.armies.find((x) => x.id === armyId);
    if (!a || !army) return;
    ctx.commands.queueAll(a.moveArmy(view(), armyId, to));
    say(fmt(S.moveOrdered, { army: army.name, province: names.province(to) }));
    update();
  }

  function onRecruit(): void {
    const a = adapter();
    const p = selProvince ? cv?.provinces.find((x) => x.id === selProvince) : undefined;
    const typeId = recruitType.value;
    if (!a || !p || !typeId) return;
    const count = clampRecruit(Number(recruitCount.value), recruitLimit(p.population));
    if (count <= 0) return;
    recruitCount.value = String(count);
    const unit = recruitType.selectedOptions[0]?.textContent ?? typeId;
    ctx.commands.queueAll(a.recruit(view(), p.id, typeId, count));
    say(fmt(S.recruitOrdered, { province: shortName(p.name), count, unit }));
    update();
  }

  function onDiplomacy(row: DiplomacyRow, b: DiplomacyButton): void {
    const a = adapter();
    if (!a) return;
    if (b.action === 'declare_war' && !window.confirm(fmt(S.confirmWar, { name: row.name })))
      return;
    if (
      b.action === 'break_treaty' &&
      !window.confirm(fmt(S.confirmBreak, { name: row.name, treaty: treatyName(b.treaty ?? '') }))
    ) {
      return;
    }
    ctx.commands.queueAll(a.diplomacyAct(view(), row.nation, b.action, b.treaty));
    say(fmt(S.diplomacySent, { name: row.name, action: b.label }));
    update();
  }

  function onConvene(): void {
    const a = adapter();
    if (!a) return;
    ctx.commands.queueAll(a.convene(view()));
    say(S.conveneOrdered);
    update();
  }

  function onMode(mode: 'auto' | 'manual'): void {
    const a = adapter();
    if (!a) return;
    ctx.commands.queueAll(a.setBattleMode(view(), mode));
    update();
  }

  function setTab(t: Tab): void {
    tab = t;
    update();
  }

  function setSize(mode: SizeMode): void {
    sizeMode = mode;
    update();
  }

  function selectArmy(army: Army | undefined, toggle = false): void {
    if (!army) return;
    selArmy = toggle && selArmy === army.id ? null : army.id;
    selProvince = army.province;
    tab = 'region';
    update();
  }

  // ---- canvas input (redraws only on a change)
  canvas.addEventListener('pointermove', (ev) => {
    if (!layout || !cv) return;
    const hit = pickAt(layout, ev.offsetX, ev.offsetY);
    const key = hit ? `${hit.kind}:${hit.id}` : '';
    if (key === hoverKey) return;
    hoverKey = key;
    let tip = '';
    if (hit?.kind === 'army') {
      const a = cv.armies.find((x) => x.id === hit.id);
      tip = a ? armyLine(a) : '';
    } else if (hit?.kind === 'province') {
      const p = cv.provinces.find((x) => x.id === hit.id);
      tip = p ? provinceTooltip(p) : '';
    }
    canvas.title = tip;
    canvas.style.cursor = hit ? 'pointer' : 'default';
    hover = hit?.kind === 'province' ? hit.id : null;
    paintMap();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!hoverKey) return;
    hoverKey = '';
    hover = null;
    paintMap();
  });
  canvas.addEventListener('click', (ev) => {
    if (!layout || !cv) return;
    const hit = pickAt(layout, ev.offsetX, ev.offsetY);
    if (!hit) {
      if (selArmy) {
        selArmy = null;
        update();
      }
      return;
    }
    if (hit.kind === 'army') {
      const army = cv.armies.find((x) => x.id === hit.id);
      if (army?.owner === PLAYER) selectArmy(army, true);
      else if (army) {
        selProvince = army.province;
        tab = 'region';
        update();
      }
      return;
    }
    if (selArmy) {
      const tg = moveTargets(cv, selArmy, rows).find((x) => x.id === hit.id);
      if (tg?.allowed) {
        orderMove(selArmy, hit.id);
        return;
      }
    }
    selProvince = hit.id;
    tab = 'region';
    update();
  });
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (!selArmy) return;
    selArmy = null;
    update();
  });

  // ---- painters
  function paintMap(): void {
    if (!cv || !g) return;
    const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);
    const targets = selArmy ? moveTargets(cv, selArmy, rows) : [];
    const sig = [
      continentSignature(cv),
      sizeMode,
      selProvince ?? '',
      selArmy ?? '',
      hover ?? '',
      JSON.stringify(targets),
      dpr,
    ].join('|');
    if (sig === mapSig) return;
    mapSig = sig;
    const w = Math.round(MAP_W * dpr);
    const h = Math.round(MAP_H * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    layout = layoutMap(cv, MAP_W, MAP_H, sizeMode);
    drawMap(g, layout, cv, { selProvince, selArmy, hover, targets }, dpr);
  }

  function armyCard(a: Army): HTMLElement {
    const mine = a.owner === PLAYER;
    const selected = a.id === selArmy;
    const card = el(
      'div',
      {
        className: `hk-sg-army${mine ? ' hk-sg-mine' : ''}${selected ? ' hk-sg-sel' : ''}`,
        on: mine ? { click: () => selectArmy(a, true) } : undefined,
      },
      [
        el('div', { className: 'hk-sg-army-head' }, [
          el('span', {}, [
            swatch(ownerColor(ownerColors(cv as ContinentView), a.owner)),
            armyLine(a),
          ]),
          mine
            ? el('span', { className: 'hk-sg-tag', text: selected ? S.selected : S.select })
            : null,
        ]),
        el('span', {
          className: a.frozen ? 'hk-sg-warn' : 'hk-muted',
          text: armyDetail(a, names),
        }),
      ],
    );
    return card;
  }

  function paintRegion(): void {
    if (!cv) return;
    const p = selProvince ? cv.provinces.find((x) => x.id === selProvince) : undefined;
    const army = selArmy ? cv.armies.find((x) => x.id === selArmy) : undefined;
    const targets = army ? moveTargets(cv, army.id, rows) : [];
    const here = p ? armiesAt(cv, p.id) : [];
    const recruitOk = !!p && canRecruitIn(p, nation);
    const sig = JSON.stringify([p, here, army, targets, selArmy, cv.wars, rows.map((r) => r.name)]);
    if (sig !== paneSig.region) {
      paneSig.region = sig;
      clear(regionInfo);
      if (!p) regionInfo.append(el('p', { className: 'hk-muted', text: S.pickHint }));
      else {
        regionInfo.append(
          el('div', { className: 'hk-sg-title', text: p.name }),
          infoTable(provinceRows(cv, p, names)),
          el('h3', { text: S.armiesHere }),
        );
        if (here.length === 0)
          regionInfo.append(el('p', { className: 'hk-muted hk-sg-small', text: S.noArmies }));
        for (const a of here) regionInfo.append(armyCard(a));
      }
      if (army) {
        const box = el('div', { className: 'hk-sg-orders' }, [
          el('h3', { text: fmt(S.armyTitle, { name: army.name }) }),
          el('p', { className: 'hk-sg-small', text: armyStatus(army, names) }),
        ]);
        if (army.frozen)
          box.append(el('p', { className: 'hk-sg-small hk-sg-warn', text: S.frozenNoMove }));
        else {
          box.append(el('p', { className: 'hk-muted hk-sg-small', text: S.moveHint }));
          const moves = el('div', { className: 'hk-sg-moves' });
          if (targets.length === 0)
            moves.append(el('span', { className: 'hk-muted hk-sg-small', text: S.moveNone }));
          for (const tg of targets) {
            const b = button(fmt(S.moveTo, { name: names.province(tg.id), days: tg.days }), () =>
              orderMove(army.id, tg.id),
            );
            if (!tg.allowed) {
              b.disabled = true;
              b.title = fmt(S.moveBlocked, { name: names.province(tg.id) });
            }
            moves.append(b);
          }
          box.append(moves);
          const blocked = targets.filter((x) => !x.allowed);
          if (blocked.length > 0) {
            box.append(
              el('p', {
                className: 'hk-muted hk-sg-small',
                text: fmt(S.moveBlocked, {
                  name: blocked.map((x) => names.province(x.id)).join(S.listSep),
                }),
              }),
            );
          }
          const direct = targets.find((x) => x.id === p?.id);
          if (p && p.id !== army.province && !p.impassable && !direct?.allowed) {
            box.append(
              el('div', { className: 'hk-row' }, [
                button(fmt(S.moveHere, { army: army.name }), () => orderMove(army.id, p.id)),
              ]),
            );
          }
        }
        box.append(
          el('div', { className: 'hk-row' }, [
            button(S.deselect, () => {
              selArmy = null;
              update();
            }),
          ]),
        );
        regionInfo.append(box);
      }
    }

    show(recruitBox, recruitOk);
    const a = adapter();
    if (!recruitOk || !p || !a) return;
    const options = a.recruitOptions(view(), p.id);
    const limit = recruitLimit(p.population);
    const rsig = JSON.stringify([p.id, options, limit]);
    if (rsig === recruitSig) return;
    recruitSig = rsig;
    const keep = recruitType.value;
    clear(recruitType);
    for (const o of options)
      recruitType.append(el('option', { text: o.name, attrs: { value: o.typeId } }));
    if (options.some((o) => o.typeId === keep)) recruitType.value = keep;
    recruitCount.max = String(Math.max(1, limit));
    const usable = options.length > 0 && limit > 0;
    setDisabled(recruitBtn, !usable);
    setDisabled(recruitCount, !usable);
    setText(
      recruitNote,
      options.length === 0
        ? S.recruitNone
        : limit > 0
          ? fmt(S.recruitLimit, { n: limit })
          : S.recruitNoPeople,
    );
  }

  function paintNation(): void {
    if (!cv) return;
    const sig = JSON.stringify([nation, rows.map((r) => r.name), cv.provinces.length]);
    if (sig === paneSig.nation) return;
    paneSig.nation = sig;
    const pane = panes.nation;
    clear(pane);
    if (!nation) {
      pane.append(el('p', { className: 'hk-muted', text: S.noNation }));
      return;
    }
    pane.append(infoTable(nationRows(nation, names)), el('h3', { text: S.yourArmies }));
    if (nation.armies.length === 0)
      pane.append(el('p', { className: 'hk-muted hk-sg-small', text: S.noArmies }));
    for (const a of nation.armies) {
      pane.append(
        el('button', {
          className: 'hk-sg-listbtn',
          text: fmt(S.armyBrief, {
            name: a.name,
            soldiers: a.soldiers,
            province: names.province(a.province),
          }),
          attrs: { type: 'button' },
          on: { click: () => selectArmy(cv?.armies.find((x) => x.id === a.id)) },
        }),
      );
    }
  }

  function paintDiplomacy(): void {
    if (!cv) return;
    const hasNation = !!nation?.alive;
    const colors = ownerColors(cv);
    const sig = JSON.stringify([rows, hasNation, [...colors]]);
    if (sig === paneSig.diplomacy) return;
    paneSig.diplomacy = sig;
    const pane = panes.diplomacy;
    clear(pane);
    if (!hasNation)
      pane.append(el('p', { className: 'hk-muted hk-sg-small', text: S.diplomacyNoNation }));
    if (rows.length === 0) pane.append(el('p', { className: 'hk-muted', text: S.diplomacyEmpty }));
    for (const row of rows) {
      const card = el('div', { className: `hk-sg-dip${row.atWar ? ' hk-sg-atwar' : ''}` }, [
        el('div', { className: 'hk-sg-dip-head' }, [
          el('span', {}, [swatch(ownerColor(colors, row.nation)), row.name]),
          el('span', { className: 'hk-sg-tag', text: row.band }),
        ]),
        ...diplomacyLines(row).map((l) =>
          el('div', {
            className: `hk-sg-dip-line${l.tone ? ` hk-sg-${l.tone}` : ''}`,
            text: l.text,
          }),
        ),
      ]);
      const acts = diplomacyActions(row, hasNation);
      if (acts.length > 0) {
        card.append(
          el(
            'div',
            { className: 'hk-sg-actions' },
            acts.map((b) =>
              el('button', {
                className: `hk-btn hk-btn-small hk-sg-act-${b.tone}`,
                text: b.label,
                title: b.hint,
                attrs: { type: 'button' },
                on: { click: () => onDiplomacy(row, b) },
              }),
            ),
          ),
        );
      }
      pane.append(card);
    }
  }

  function paintAffairs(): void {
    if (!cv) return;
    const wars = warSummaries(cv, names);
    const sig = JSON.stringify(wars);
    if (sig !== paneSig.affairs) {
      paneSig.affairs = sig;
      clear(warList);
      if (wars.length === 0)
        warList.append(el('p', { className: 'hk-muted hk-sg-small', text: S.noWars }));
      for (const w of wars) {
        warList.append(
          el('div', { className: `hk-sg-war${w.involvesPlayer ? ' hk-sg-mine' : ''}` }, [
            el('div', { text: w.title }),
            el('div', { className: 'hk-muted', text: w.detail }),
          ]),
        );
      }
    }
    setText(confLine, conferenceText(cv));
    show(conveneBtn, canConvene(cv, view().flags()));
    const mode = battleModeFrom(view().world.slices);
    setClass(modeBtns.auto, 'active', mode === 'auto');
    setClass(modeBtns.manual, 'active', mode === 'manual');
    const pend = pendingText(cv, names);
    setText(pendingAffairs, pend ?? S.pendingNone);
    setClass(pendingAffairs, 'hk-sg-warn', !!pend);
    show(affairsBattleBtn, !!pend);
  }

  function paintLog(): void {
    if (!cv) return;
    const sig = JSON.stringify(cv.log);
    if (sig === paneSig.log) return;
    paneSig.log = sig;
    const pane = panes.log;
    clear(pane);
    pane.append(el('h3', { text: S.logTitle }));
    const lines = logLines(cv);
    if (lines.length === 0) {
      pane.append(el('p', { className: 'hk-muted', text: S.logEmpty }));
      return;
    }
    pane.append(
      el(
        'ol',
        { className: 'hk-sg-log' },
        lines.map((l) => el('li', { text: l })),
      ),
    );
  }

  // ---- refresh
  function update(): void {
    const a = adapter();
    show(placeholder, !a);
    show(body, !!a);
    if (!a) return;
    const v = view();
    cv = a.continent(v);
    nation = a.nation(v, PLAYER);
    rows = a.diplomacy(v);
    names = buildNames(cv, rows, nation);
    if (selArmy && !isPlayerArmy(cv, selArmy)) selArmy = null;
    if (selProvince && !cv.provinces.some((p) => p.id === selProvince)) selProvince = null;

    const fs = foundingState(v.flags(), nation);
    show(foundBox, fs.show);
    show(foundRow, fs.can);
    setText(foundReason, fs.reason);
    show(foundReason, !!fs.reason);

    noticeAge += 1;
    if (notice && noticeAge > NOTICE_UPDATES) notice = '';
    setText(orderNote, notice);
    show(orderNote, !!notice);

    show(inactive, !cv.active);
    show(main, cv.active);
    if (!cv.active) return;

    setText(status, statusText(cv));
    const pend = pendingText(cv, names);
    setText(pendingLine, pend ?? '');
    show(pendingBox, !!pend);
    setClass(sizeBtns.population, 'active', sizeMode === 'population');
    setClass(sizeBtns.garrison, 'active', sizeMode === 'garrison');
    for (const t of TABS) {
      const b = tabBtns.get(t);
      if (b) {
        setClass(b, 'hk-sg-on', t === tab);
        if (b.getAttribute('aria-selected') !== String(t === tab)) {
          b.setAttribute('aria-selected', String(t === tab));
        }
      }
      show(panes[t], t === tab);
    }

    paintMap();
    if (tab === 'region') paintRegion();
    else if (tab === 'nation') paintNation();
    else if (tab === 'diplomacy') paintDiplomacy();
    else if (tab === 'affairs') paintAffairs();
    else paintLog();
  }

  return {
    el: root,
    update,
    dispose() {
      layout = null;
      cv = null;
    },
  };
}

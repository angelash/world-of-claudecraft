// Quest and story graph: quests laid out in act columns and coloured by reachability,
// edges for flags written by one quest and read by another quest's trigger, a detail
// pane (trigger, writers of each variable, stages, writes), an issue list (flags without
// writers, unreachable or stuck quests, acts nobody switches to, unparsable conditions)
// and the full flag table with every writer and reader. Thin DOM layer over
// flag_index.ts and quest_graph.ts.

import type { FlagValue } from '../../core/contracts';
import type { ActDef, QuestDef } from '../../systems/quests';
import { append, button, clear, fill, h } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import { loadCodeSources } from './code_sources';
import { buildFlagIndex, type FlagRef, isDynamic } from './flag_index';
import { buildQuestGraph, type QuestGraph, type QuestInfo, type QuestState } from './quest_graph';

type GameModule = typeof import('../../game/create');

const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 230;
const NODE_W = 200;
const NODE_H = 42;
const ROW_H = 54;
const TOP = 34;

const STATE_COLOR: Record<QuestState, string> = {
  reachable: '#2f6b3f',
  stuck: '#7a6420',
  unreachable: '#7a2e2e',
  undecided: '#4a4f58',
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

export class QuestGraphTool implements EditorTool {
  readonly id = 'quests';
  readonly label = T.nav.questGraph;
  private host!: ToolHost;
  private ws!: Workspace;
  private graph: QuestGraph | null = null;
  private index: FlagRef[] = [];
  private selected = '';
  private side: 'issues' | 'flags' = 'issues';
  private flagFilter = '';
  private flagSelected = '';
  private builtAt = -1;
  private busy = false;
  private summaryEl!: HTMLElement;
  private graphEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private sideEl!: HTMLElement;

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.summaryEl = h('div', { class: 'summary' });
    this.graphEl = h('div', { class: 'graph-wrap' });
    this.detailEl = h('div', { class: 'detail' });
    this.sideEl = h('div', { class: 'graph-side' });
    append(
      root,
      h(
        'div',
        { class: 'quest-tool pane' },
        this.summaryEl,
        h(
          'div',
          { class: 'quest-split' },
          this.graphEl,
          h('div', { class: 'quest-right' }, this.detailEl, this.sideEl),
        ),
      ),
    );
  }

  show(params: Record<string, string>): void {
    if (params.quest) this.selected = params.quest;
    if (!this.graph || this.builtAt !== this.ws.revision) void this.build();
    else this.render();
  }

  hide(): void {}

  private quests(): QuestDef[] {
    return ((this.ws.content() as unknown as { quests?: QuestDef[] }).quests ?? []) as QuestDef[];
  }

  private acts(): ActDef[] {
    return ((this.ws.content() as unknown as { acts?: ActDef[] }).acts ?? []) as ActDef[];
  }

  private async build(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    fill(this.summaryEl, T.quests.building);
    try {
      const sources = await loadCodeSources();
      this.index = buildFlagIndex(this.ws.allData(), sources);
      let initialFlags: Record<string, FlagValue> = {};
      try {
        const mod: GameModule = await import('../../game/create');
        initialFlags = {
          ...mod.createGame({ aiMode: 'off', content: this.ws.content() }).world.meta.flags,
        };
      } catch {
        // no initial flags: act and friends are then judged from writers only
      }
      this.graph = buildQuestGraph({
        quests: this.quests(),
        acts: this.acts(),
        index: this.index,
        initialFlags,
      });
      this.builtAt = this.ws.revision;
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    }
    this.busy = false;
    this.render();
  }

  private render(): void {
    const g = this.graph;
    clear(this.summaryEl);
    if (!g) return;
    const writes = this.index.filter((r) => r.kind === 'write');
    const counts = { reachable: 0, stuck: 0, unreachable: 0, undecided: 0 } as Record<
      QuestState,
      number
    >;
    for (const v of Object.values(g.verdicts)) counts[v.state]++;
    append(
      this.summaryEl,
      button(T.quests.build, () => void this.build(), { class: 'primary' }),
      ' ',
      fmt(T.quests.indexSummary, {
        dataW: writes.filter((w) => w.origin === 'data').length,
        codeW: writes.filter((w) => w.origin === 'code').length,
        dyn: writes.filter((w) => isDynamic(w.key)).length,
        reads: this.index.length - writes.length,
      }),
      h('br'),
      fmt(T.quests.verdictSummary, { total: g.quests.length, ...counts }),
      h('br'),
      h('span', { class: 'muted small', text: T.quests.legend }),
    );
    this.renderGraph(g);
    this.renderDetail(g);
    this.renderSide(g);
  }

  private renderGraph(g: QuestGraph): void {
    clear(this.graphEl);
    if (g.quests.length === 0) {
      this.graphEl.append(h('p', { class: 'muted', text: T.quests.noQuests }));
      return;
    }
    const cols = [...g.acts.map((a) => a.id)];
    const extra = g.quests.map((q) => q.act).filter((a) => !cols.includes(a));
    cols.push(...new Set(extra));
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    cols.forEach((act, ci) => {
      const qs = g.quests
        .filter((q) => q.act === act)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      qs.forEach((q, ri) => {
        pos.set(q.id, { x: 10 + ci * COL_W, y: TOP + ri * ROW_H });
      });
      maxRows = Math.max(maxRows, qs.length);
    });
    const width = 20 + cols.length * COL_W;
    const height = TOP + maxRows * ROW_H + 20;
    const root = svg('svg', { width, height, class: 'quest-graph' });
    cols.forEach((act, ci) => {
      const def = g.acts.find((a) => a.id === act);
      const bad = g.unreachableActs.includes(act);
      root.append(
        svg(
          'text',
          { x: 10 + ci * COL_W, y: 20, fill: bad ? '#ff6b6b' : '#c9cdd3', 'font-size': 13 },
          def ? `${def.title}` : `${act || T.quests.actUnknown}`,
        ),
      );
    });
    const focus = this.selected;
    for (const e of g.edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const hot = e.from === focus || e.to === focus;
      const x1 = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x;
      const y2 = b.y + NODE_H / 2;
      const d =
        x2 > x1
          ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${x1 + 60},${y1} ${x1 + 60},${y2} ${x1},${y2}`;
      const path = svg('path', {
        d,
        fill: 'none',
        stroke: hot ? '#5aa0ff' : 'rgba(160,170,185,0.35)',
        'stroke-width': hot ? 2 : 1,
      });
      path.append(svg('title', {}, e.via));
      root.append(path);
    }
    for (const q of g.quests) {
      const p = pos.get(q.id);
      if (!p) continue;
      const v = g.verdicts[q.id];
      const node = svg('g', { transform: `translate(${p.x},${p.y})`, class: 'quest-node' });
      node.append(
        svg('rect', {
          width: NODE_W,
          height: NODE_H,
          rx: 5,
          fill: STATE_COLOR[v?.state ?? 'undecided'],
          stroke: q.id === focus ? '#ffffff' : q.kind === 'main' ? '#c9b38a' : '#3a3f49',
          'stroke-width': q.id === focus ? 2.5 : 1,
        }),
        svg('text', { x: 8, y: 17, fill: '#e3e5e8', 'font-size': 12 }, q.title.slice(0, 15)),
        svg('text', { x: 8, y: 33, fill: '#9aa1ab', 'font-size': 10 }, q.id.slice(0, 30)),
      );
      node.addEventListener('click', () => {
        this.selected = q.id;
        this.host.setParams({ quest: q.id });
        this.render();
      });
      root.append(node);
    }
    this.graphEl.append(root);
  }

  private writersLine(key: string): string {
    const f = this.graph?.flags.find((x) => x.key === key);
    if (!f) return T.quests.none;
    if (f.builtin) return T.quests.flagBuiltin;
    const list = f.writers.map(
      (w) => `${w.file} ${w.where}${w.value !== undefined ? ` = ${String(w.value)}` : ''}`,
    );
    if (f.initial) list.unshift(T.quests.flagInitial);
    return list.length ? list.slice(0, 8).join('；') : T.quests.none;
  }

  private renderDetail(g: QuestGraph): void {
    clear(this.detailEl);
    const info = g.quests.find((q) => q.id === this.selected);
    const def = this.quests().find((q) => q.id === this.selected);
    if (!info || !def) {
      this.detailEl.append(h('p', { class: 'muted', text: T.quests.pick }));
      return;
    }
    const v = g.verdicts[info.id];
    const stateLabel = {
      reachable: T.quests.stateReachable,
      stuck: T.quests.stateStuck,
      unreachable: T.quests.stateUnreachable,
      undecided: T.quests.stateUndecided,
    }[v?.state ?? 'undecided'];
    const schema = this.ws.schemasForTable('quests')[0];
    append(
      this.detailEl,
      h('div', {
        class: 'pane-title',
        text: `${info.title}（${info.id}）| ${info.act} | ${info.kind}`,
      }),
      h(
        'p',
        { class: v?.state === 'reachable' ? 'ok' : 'bad' },
        stateLabel,
        v?.stage !== undefined ? ` | ${T.quests.stage} ${v.stage + 1}` : '',
        v?.blockers.length ? ` | ${T.quests.blockers}：${v.blockers.join('，')}` : '',
        v?.unwritten.length ? ` | ${T.quests.unwritten}：${v.unwritten.join('，')}` : '',
      ),
      schema
        ? button(
            T.quests.openQuest,
            () =>
              this.host.navigate('content', { file: schema.file, table: 'quests', row: info.id }),
            {
              class: 'link small',
            },
          )
        : null,
      h('div', {
        class: 'sub-title',
        text: `${T.quests.trigger}：${info.trigger || T.quests.none}`,
      }),
      this.varTable(info.triggerVars),
      h('div', { class: 'sub-title', text: T.quests.objectives }),
      h(
        'ol',
        null,
        ...def.stages.map((s) =>
          h(
            'li',
            null,
            `${s.id}：${s.desc}`,
            h(
              'ul',
              null,
              ...s.objectives.map((o) =>
                h('li', {
                  class: 'small',
                  text: `${o.type} | ${o.label}${o.type === 'flag' ? ` | ${o.when}` : ''}`,
                }),
              ),
            ),
          ),
        ),
      ),
      h('div', { class: 'sub-title', text: T.quests.writes }),
      this.writeList(info),
      info.starts.length ? h('p', { text: `${T.quests.starts}：${info.starts.join('，')}` }) : null,
      info.badConditions.length
        ? h('p', {
            class: 'bad',
            text: info.badConditions.map((b) => `${b.where}：${b.error}`).join('；'),
          })
        : null,
    );
  }

  private varTable(vars: string[]): HTMLElement {
    if (vars.length === 0) return h('p', { class: 'muted', text: T.quests.none });
    const t = h('table', { class: 'grid kv' });
    for (const v of vars)
      t.append(
        h(
          'tr',
          null,
          h('th', { class: 'mono', text: v }),
          h('td', { class: 'small', text: this.writersLine(v) }),
        ),
      );
    return t;
  }

  private writeList(info: QuestInfo): HTMLElement {
    if (info.writes.length === 0) return h('p', { class: 'muted', text: T.quests.none });
    return h(
      'ul',
      { class: 'problem-list' },
      ...info.writes.map((w) =>
        h('li', {
          class: 'small mono',
          text: `${w.key}${w.value !== undefined ? ` = ${String(w.value)}` : ''} (${w.via}, ${w.where})`,
        }),
      ),
    );
  }

  private renderSide(g: QuestGraph): void {
    clear(this.sideEl);
    append(
      this.sideEl,
      h(
        'div',
        { class: 'tabs' },
        button(T.quests.tabIssues, () => this.setSide('issues'), {
          class: `tab${this.side === 'issues' ? ' active' : ''}`,
        }),
        button(T.quests.tabFlags, () => this.setSide('flags'), {
          class: `tab${this.side === 'flags' ? ' active' : ''}`,
        }),
      ),
    );
    if (this.side === 'issues') this.renderIssues(g);
    else this.renderFlags(g);
  }

  private setSide(side: 'issues' | 'flags'): void {
    this.side = side;
    if (this.graph) this.renderSide(this.graph);
  }

  private questLink(id: string): HTMLElement {
    return button(
      id,
      () => {
        this.selected = id;
        this.render();
      },
      { class: 'link small' },
    );
  }

  private renderIssues(g: QuestGraph): void {
    const verdicts = Object.values(g.verdicts);
    const unreachable = verdicts.filter((v) => v.state === 'unreachable');
    const stuck = verdicts.filter((v) => v.state === 'stuck');
    const bad = g.quests.flatMap((q) => q.badConditions.map((b) => ({ q: q.id, ...b })));
    const list = (title: string, items: HTMLElement[]) =>
      h(
        'details',
        { open: items.length > 0 },
        h('summary', { text: title }),
        items.length
          ? h('ul', { class: 'problem-list' }, ...items)
          : h('p', { class: 'muted', text: T.quests.none }),
      );
    append(
      this.sideEl,
      list(
        fmt(T.quests.noWriterTitle, { n: g.noWriter.length }),
        g.noWriter.map((f) =>
          h(
            'li',
            { class: 'bad' },
            h('span', { class: 'mono', text: f.key }),
            ` | ${T.quests.readers}：`,
            f.readers
              .slice(0, 4)
              .map((r) => `${r.file} ${r.where}`)
              .join('；'),
          ),
        ),
      ),
      list(
        fmt(T.quests.unreachableTitle, { n: unreachable.length }),
        unreachable.map((v) =>
          h(
            'li',
            null,
            this.questLink(v.id),
            ` | ${T.quests.blockers}：${v.blockers.join('，') || T.quests.none}${v.unwritten.length ? ` | ${T.quests.unwritten}：${v.unwritten.join('，')}` : ''}`,
          ),
        ),
      ),
      list(
        fmt(T.quests.stuckTitle, { n: stuck.length }),
        stuck.map((v) =>
          h(
            'li',
            null,
            this.questLink(v.id),
            ` | ${T.quests.stage} ${(v.stage ?? 0) + 1} | ${T.quests.blockers}：${v.blockers.join('，')}`,
          ),
        ),
      ),
      list(
        fmt(T.quests.actsTitle, { n: g.unreachableActs.length }),
        g.unreachableActs.map((a) => h('li', { class: 'mono', text: a })),
      ),
      list(
        fmt(T.quests.badTitle, { n: bad.length }),
        bad.map((b) => h('li', null, this.questLink(b.q), ` | ${b.where}：${b.error}`)),
      ),
      list(
        fmt(T.quests.unreadTitle, { n: g.unread.length }),
        g.unread.map((f) =>
          h(
            'li',
            { class: 'small' },
            h('span', { class: 'mono', text: f.key }),
            ` | ${f.writers
              .slice(0, 3)
              .map((w) => `${w.file} ${w.where}`)
              .join('；')}`,
          ),
        ),
      ),
    );
  }

  private renderFlags(g: QuestGraph): void {
    const input = h('input', {
      type: 'search',
      value: this.flagFilter,
      placeholder: T.quests.flagFilter,
    });
    input.addEventListener('change', () => {
      this.flagFilter = input.value;
      this.renderSide(g);
    });
    const q = this.flagFilter.trim().toLowerCase();
    const noWriter = new Set(g.noWriter.map((f) => f.key));
    const unread = new Set(g.unread.map((f) => f.key));
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[T.common.id, T.quests.writers, T.quests.readers, T.quests.flagStatus].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const f of g.flags) {
      if (q && !f.key.toLowerCase().includes(q)) continue;
      const status = f.builtin
        ? T.quests.flagBuiltin
        : noWriter.has(f.key)
          ? T.quests.flagNoWriter
          : unread.has(f.key)
            ? T.quests.flagUnread
            : T.quests.flagOk;
      table.append(
        h(
          'tr',
          {
            class: `${f.key === this.flagSelected ? 'selected' : ''}${noWriter.has(f.key) ? ' has-problem' : ''}`,
            on: {
              click: () => {
                this.flagSelected = f.key;
                this.renderSide(g);
              },
            },
          },
          h('td', { class: 'mono', text: f.key }),
          h('td', { text: String(f.writers.length) }),
          h('td', { text: String(f.readers.length) }),
          h('td', { text: status }),
        ),
      );
    }
    const sel = g.flags.find((f) => f.key === this.flagSelected);
    const refs = (title: string, list: FlagRef[]) =>
      h(
        'div',
        null,
        h('div', { class: 'sub-title', text: `${title}（${list.length}）` }),
        h(
          'ul',
          { class: 'problem-list' },
          ...list.slice(0, 200).map((r) =>
            h('li', {
              class: 'small mono',
              text: `${r.origin} ${r.file} ${r.where} ${r.via}${r.value !== undefined ? ` = ${String(r.value)}` : ''}${r.quest ? ` [${r.quest}]` : ''}`,
            }),
          ),
        ),
      );
    append(
      this.sideEl,
      input,
      sel
        ? h(
            'div',
            { class: 'flag-detail' },
            h('div', { class: 'pane-title mono', text: sel.key }),
            refs(T.quests.writers, sel.writers),
            refs(T.quests.readers, sel.readers),
          )
        : null,
      h('div', { class: 'table-wrap' }, table),
    );
  }
}

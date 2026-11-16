// AI audit desk: every AI decision of the live game (the shared AuditLog the inspector's
// AiRunner writes) or of past sessions (GET /api/audit), filtered by agent, role,
// outcome, reason and leaks, with the prompt, raw output, parsed commands, rejected
// commands, validation, cost and latency of each, plus a reveal-ledger review of its
// texts at the current world flags. The runner status (degradation level, budget)
// heads the page. Thin DOM layer over audit_model.ts.

import type { AuditLog, AuditRecord } from '../../ai/audit';
import { reviewRecords } from '../ledger/leak_review';
import { append, button, clear, fill, h, rafThrottle, select } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { GameSession } from '../state/game_session';
import { degradeLevelText, fmt, T } from '../text';
import {
  type AuditFilter,
  auditFacets,
  EMPTY_FILTER,
  filterAudit,
  formatUsd,
  type HistoryPage,
  hasLeak,
  parseHistoryPage,
  summarizeAudit,
} from './audit_model';

export type HistoryLoader = (q: {
  offset: number;
  limit: number;
  rotated: boolean;
}) => Promise<{ ok: true; body: unknown } | { ok: false; message: string }>;

const LIST_LIMIT = 300;

export class AuditTool implements EditorTool {
  readonly id = 'audit';
  readonly label = T.nav.audit;
  private host!: ToolHost;
  private visible = false;
  private tab: 'live' | 'history' = 'live';
  private filter: AuditFilter = { ...EMPTY_FILTER };
  private selected = '';
  private history: HistoryPage | null = null;
  private histOffset = 0;
  private readonly histLimit = 100;
  private histRotated = false;
  private statusEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private filtersEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private readonly rerender = rafThrottle(() => this.render());

  constructor(
    private readonly session: GameSession,
    private readonly audit: AuditLog,
    private readonly loadHistory: HistoryLoader,
  ) {}

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.statusEl = h('div', { class: 'audit-status' });
    this.tabsEl = h('div', { class: 'tabs' });
    this.filtersEl = h('div', { class: 'toolbar wrap' });
    this.summaryEl = h('div', { class: 'summary muted' });
    this.listEl = h('div', { class: 'table-wrap' });
    this.detailEl = h('div', { class: 'detail audit-detail' });
    append(
      root,
      h(
        'div',
        { class: 'audit-tool pane' },
        this.statusEl,
        this.tabsEl,
        this.filtersEl,
        this.summaryEl,
        h('div', { class: 'split2 audit-split' }, this.listEl, this.detailEl),
      ),
    );
    this.audit.subscribe(() => {
      if (this.visible && this.tab === 'live') this.rerender();
    });
    this.session.subscribe(() => {
      if (this.visible) this.rerender();
    });
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    if (params.id) {
      this.selected = params.id;
      this.tab = 'live';
    }
    this.render();
  }

  hide(): void {
    this.visible = false;
  }

  private records(): readonly Readonly<AuditRecord>[] {
    return this.tab === 'live' ? this.audit.list() : (this.history?.records ?? []);
  }

  private render(): void {
    this.renderStatus();
    this.renderTabs();
    const records = this.records();
    this.renderFilters(records);
    const shown = filterAudit(records, this.filter);
    this.renderSummary(shown);
    this.renderList(shown);
    this.renderDetail(records.find((r) => r.auditId === this.selected));
  }

  private renderStatus(): void {
    clear(this.statusEl);
    const game = this.session.game;
    if (!game?.runner) {
      this.statusEl.append(h('p', { class: 'notice', text: T.audit.noRunner }));
      return;
    }
    const s = game.runner.status();
    const b = s.budget;
    const kind = { proxy: T.ai.providerProxy, mock: T.ai.providerMock, null: T.ai.providerNull }[
      game.provider ?? 'null'
    ];
    const rows: [string, string][] = [
      [T.audit.provider, `${kind}（${game.providerNote}）`],
      [T.audit.level, degradeLevelText(s.level)],
      [T.audit.providerAvailable, s.providerAvailable ? T.common.yes : T.common.no],
      [T.audit.inFlight, String(s.inFlight)],
      [T.audit.hourUsd, `${formatUsd(b.hourUsd)} / ${formatUsd(b.perHourUsd, 2)}`],
      [T.audit.totalUsd, formatUsd(b.totalUsd)],
      [T.audit.byRole, JSON.stringify(b.byRole)],
      [
        T.audit.blockedUntil,
        s.blockedUntil > 0 ? String(Math.round(s.blockedUntil)) : T.common.none,
      ],
    ];
    const table = h('table', { class: 'grid kv' });
    for (const [k, v] of rows)
      table.append(h('tr', null, h('th', { text: k }), h('td', { text: v })));
    this.statusEl.append(table);
  }

  private renderTabs(): void {
    fill(
      this.tabsEl,
      button(T.audit.tabLive, () => this.setTab('live'), {
        class: `tab${this.tab === 'live' ? ' active' : ''}`,
      }),
      button(T.audit.tabHistory, () => this.setTab('history'), {
        class: `tab${this.tab === 'history' ? ' active' : ''}`,
      }),
      this.tab === 'history' ? this.historyControls() : null,
    );
  }

  private setTab(tab: 'live' | 'history'): void {
    this.tab = tab;
    this.selected = '';
    if (tab === 'history' && !this.history) void this.fetchHistory();
    this.render();
  }

  private historyControls(): HTMLElement {
    const page = this.history;
    const rotated = h('input', { type: 'checkbox', checked: this.histRotated });
    rotated.addEventListener('change', () => {
      this.histRotated = rotated.checked;
      this.histOffset = 0;
      void this.fetchHistory();
    });
    return h(
      'span',
      { class: 'inline' },
      button(T.audit.historyLoad, () => void this.fetchHistory()),
      button(
        T.audit.historyPrev,
        () => {
          this.histOffset = Math.max(0, this.histOffset - this.histLimit);
          void this.fetchHistory();
        },
        { disabled: this.histOffset === 0 },
      ),
      button(
        T.audit.historyNext,
        () => {
          this.histOffset += this.histLimit;
          void this.fetchHistory();
        },
        { disabled: !page || this.histOffset + this.histLimit >= page.total },
      ),
      h('label', { class: 'check' }, rotated, T.audit.historyRotated),
      page
        ? h('span', {
            class: 'muted small',
            text: fmt(T.audit.historyPage, {
              from: page.total ? page.offset + 1 : 0,
              to: Math.min(page.total, page.offset + page.records.length),
              total: page.total,
              skipped: page.skipped,
            }),
          })
        : null,
    );
  }

  private async fetchHistory(): Promise<void> {
    const res = await this.loadHistory({
      offset: this.histOffset,
      limit: this.histLimit,
      rotated: this.histRotated,
    });
    if (!res.ok) {
      this.host.notify(`${T.audit.historyFailed}：${res.message}`, 'error');
      return;
    }
    const page = parseHistoryPage(res.body);
    if (!page) {
      this.host.notify(T.audit.historyFailed, 'error');
      return;
    }
    this.history = page;
    if (page.total === 0) this.host.notify(T.audit.historyEmpty);
    this.render();
  }

  private renderFilters(records: readonly Readonly<AuditRecord>[]): void {
    const facets = auditFacets(records);
    const opts = (values: string[]) => [
      { value: '', label: T.common.all },
      ...values.map((v) => ({ value: v, label: v })),
    ];
    const set = (patch: Partial<AuditFilter>) => {
      this.filter = { ...this.filter, ...patch };
      this.render();
    };
    const text = h('input', {
      type: 'search',
      value: this.filter.text,
      placeholder: T.audit.filterText,
    });
    text.addEventListener('change', () => set({ text: text.value }));
    fill(
      this.filtersEl,
      h(
        'label',
        { class: 'check' },
        T.audit.filterAgent,
        select(opts(facets.agents), this.filter.agent, (v) => set({ agent: v })),
      ),
      h(
        'label',
        { class: 'check' },
        T.audit.filterRole,
        select(opts(facets.roles), this.filter.role, (v) => set({ role: v })),
      ),
      h(
        'label',
        { class: 'check' },
        T.audit.filterOutcome,
        select(opts(facets.outcomes), this.filter.outcome, (v) => set({ outcome: v })),
      ),
      h(
        'label',
        { class: 'check' },
        T.audit.filterReason,
        select(opts(facets.reasons), this.filter.reason, (v) => set({ reason: v })),
      ),
      h(
        'label',
        { class: 'check' },
        T.audit.filterLeak,
        select(
          [
            { value: 'all', label: T.audit.leakAll },
            { value: 'leak', label: T.audit.leakYes },
            { value: 'clean', label: T.audit.leakNo },
          ],
          this.filter.leak,
          (v) => set({ leak: v as AuditFilter['leak'] }),
        ),
      ),
      text,
    );
  }

  private renderSummary(shown: readonly Readonly<AuditRecord>[]): void {
    const s = summarizeAudit(shown);
    this.summaryEl.textContent = fmt(T.audit.summary, {
      total: s.total,
      outcomes: Object.entries(s.byOutcome)
        .map(([k, v]) => `${k} ${v}`)
        .join('，'),
      cost: formatUsd(s.costUsd),
      mean: Math.round(s.meanLatencyMs),
      p90: Math.round(s.p90LatencyMs),
      leaks: s.leaks,
      accepted: s.acceptedCommands,
      rejected: s.rejectedCommands,
      inTok: s.inputTokens,
      outTok: s.outputTokens,
    });
  }

  private renderList(shown: readonly Readonly<AuditRecord>[]): void {
    clear(this.listEl);
    if (shown.length === 0) {
      this.listEl.append(h('p', { class: 'muted', text: T.audit.none }));
      return;
    }
    const a = T.audit;
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[
          a.colTick,
          a.colAgent,
          a.colRole,
          a.colPurpose,
          a.colOutcome,
          a.colReason,
          a.colModel,
          a.colCost,
          a.colLatency,
          a.colLeak,
        ].map((t) => h('th', { text: t })),
      ),
    );
    for (const r of shown.slice(0, LIST_LIMIT)) {
      table.append(
        h(
          'tr',
          {
            class: `${r.auditId === this.selected ? 'selected' : ''}${hasLeak(r) || r.outcome === 'declined' ? ' has-problem' : ''}`,
            on: {
              click: () => {
                this.selected = r.auditId;
                this.host.setParams({ id: r.auditId });
                this.render();
              },
            },
          },
          h('td', { text: String(r.tick) }),
          h('td', { text: r.agentId }),
          h('td', { class: 'mono', text: r.role }),
          h('td', { text: r.purpose }),
          h('td', { text: r.outcome }),
          h('td', { text: r.reason ?? '' }),
          h('td', { class: 'mono small', text: r.model ?? r.requestedModel ?? '' }),
          h('td', { text: r.costUsd !== undefined ? r.costUsd.toFixed(5) : '' }),
          h('td', { text: r.latencyMs !== undefined ? String(Math.round(r.latencyMs)) : '' }),
          h('td', {
            class: 'bad',
            text: hasLeak(r) ? (r.leaks ?? []).join(' ') || T.audit.leakYes : '',
          }),
        ),
      );
    }
    this.listEl.append(table);
  }

  private renderDetail(r: Readonly<AuditRecord> | undefined): void {
    clear(this.detailEl);
    if (!r) {
      this.detailEl.append(h('p', { class: 'muted', text: T.audit.pick }));
      return;
    }
    const a = T.audit;
    const block = (title: string, value: unknown, open = true) => {
      if (value === undefined || value === null || value === '') return null;
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return h(
        'details',
        { open },
        h('summary', { text: title }),
        h('pre', { class: 'json', text }),
      );
    };
    const game = this.session.game;
    const review = game ? reviewRecords([r], game.engine.world, game.content) : [];
    append(
      this.detailEl,
      h('div', {
        class: 'pane-title',
        text: `${r.agentId} | ${r.role} | ${r.purpose} | ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`,
      }),
      r.detail ? h('p', { class: 'muted', text: r.detail }) : null,
      block(
        a.secMeta,
        {
          auditId: r.auditId,
          requestId: r.requestId,
          tick: r.tick,
          epoch: r.epoch,
          rolePackVersion: r.rolePackVersion,
          degradeLevel: r.degradeLevel,
          tier: r.tier,
        },
        false,
      ),
      block(a.secSystem, r.prompt?.system, false),
      block(a.secStable, r.prompt?.stable, false),
      block(a.secContext, r.prompt?.context),
      block(a.secPlayer, r.playerText),
      block(a.secRaw, r.rawOutput),
      block(a.secParsed, r.parsed, false),
      block(a.secCommands, r.commands),
      block(a.secRejected, r.rejected),
      block(a.secValidation, r.validation),
      block(a.secSpeech, r.speech),
      block(a.secThought, r.thought),
      block(a.secLeaks, r.leaks?.length ? r.leaks : undefined),
      h(
        'details',
        { open: true },
        h('summary', { text: a.secReview }),
        review.length
          ? h(
              'ul',
              { class: 'problem-list' },
              ...review.map((x) =>
                h('li', { class: 'bad', text: `${x.path}：${x.terms.join('、')} | ${x.snippet}` }),
              ),
            )
          : h('p', { class: 'muted', text: a.reviewClean }),
      ),
      block(a.secUsage, {
        model: r.model,
        requestedModel: r.requestedModel,
        usage: r.usage,
        costUsd: r.costUsd,
        reservedUsd: r.reservedUsd,
        latencyMs: r.latencyMs,
        stopReason: r.stopReason,
      }),
    );
  }
}

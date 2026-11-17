// The asset review desk (素材审核台): the one place every generated asset is reviewed, art
// and audio alike (assets/README.md 3.3 and 3.4; art_pipeline.md 15; audio_direction.md
// 11.5). Three columns after the production desk pattern: the asset list (search, kind and
// state chips, grouped by category), the stage (candidate takes with players, A/B compare,
// layer mixing, 1x and 3x images, the adopted original), and the inspector (entry facts,
// the record, the decision form with reason codes, the append-only review trail).
// Thin DOM layer over asset_model.ts and asset_client.ts; writes go to the dev service.

import './asset_desk.css';
import { append, button, fill, h, typingInField } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import { fmt, T } from '../text';
import type { AssetDeskApi } from './asset_client';
import {
  type AssetRow,
  adoptedKeys,
  assetUrl,
  type Candidate,
  candidateGroups,
  type DeskListing,
  decisionProblems,
  filterRows,
  groupRows,
  isImagePath,
  type KindFilter,
  metricText,
  type ReviewEvent,
  type StateFilter,
  type Status,
  stateCounts,
  stepId,
  togglePick,
} from './asset_model';
import { AudioDeck } from './audio_deck';

const REVIEWER_KEY = 'hakoniwa.assets.reviewer';
const LIST_LIMIT = 600;
const DECISIONS: Status[] = ['approved', 'rework', 'rejected', 'retired', 'review'];
const STATE_ORDER = [
  'unregistered',
  'candidates',
  'review',
  'rework',
  'approved',
  'rejected',
  'retired',
];

function readReviewer(): string {
  try {
    return window.localStorage.getItem(REVIEWER_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveReviewer(name: string): void {
  try {
    window.localStorage.setItem(REVIEWER_KEY, name);
  } catch {
    // storage off: the name is asked again next time
  }
}

export class AssetReviewTool implements EditorTool {
  readonly id = 'assets';
  readonly label = T.nav.assets;
  private host!: ToolHost;
  private listing: DeskListing | null = null;
  private loadError = '';
  private query = '';
  private kind: KindFilter = 'all';
  private state: StateFilter = 'all';
  private selected = '';
  private picks: string[] = [];
  private compare: string[] = [];
  private trail: ReviewEvent[] = [];
  private decision: Status = 'approved';
  private reasons: string[] = [];
  /** Form text kept across re-renders (chips, trail loads), cleared after a submit. */
  private noteDraft = '';
  private reviewerDraft = readReviewer();
  /** A request is in flight: adopt and submit stay disabled. */
  private busy = false;
  /** Replacing an approved or retired original takes a second click. */
  private confirmReplace = false;
  private visible = false;
  private readonly deck = new AudioDeck();
  /** Card controls of the open asset, updated in place so playing takes keep playing. */
  private cardViews = new Map<
    string,
    { card: HTMLElement; pick: HTMLButtonElement; cmp: HTMLButtonElement | null }
  >();
  private compareHost: HTMLElement | null = null;
  private adoptHost: HTMLElement | null = null;
  private searchEl!: HTMLInputElement;
  private chipsEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private listEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private inspectorEl!: HTMLElement;

  constructor(private readonly api: AssetDeskApi) {}

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.searchEl = h('input', {
      type: 'search',
      placeholder: T.assets.search,
      attrs: { 'aria-label': T.assets.search },
    });
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.pushParams();
      this.renderList();
    });
    this.chipsEl = h('div', { class: 'asset-chips' });
    this.summaryEl = h('div', { class: 'asset-summary muted small' });
    this.listEl = h('div', { class: 'asset-list' });
    this.stageEl = h('div', { class: 'asset-stage pane' });
    this.inspectorEl = h('div', { class: 'asset-inspector pane' });
    append(
      root,
      h(
        'div',
        { class: 'asset-desk' },
        h(
          'div',
          { class: 'asset-left' },
          h(
            'div',
            { class: 'toolbar' },
            this.searchEl,
            button(T.assets.refresh, () => void this.load()),
          ),
          this.chipsEl,
          this.summaryEl,
          this.listEl,
          h('div', { class: 'muted small asset-keys', text: T.assets.keys }),
        ),
        this.stageEl,
        this.inspectorEl,
      ),
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    void this.load();
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    this.query = params.q ?? this.query;
    this.searchEl.value = this.query;
    if (params.kind === 'art' || params.kind === 'audio' || params.kind === 'all')
      this.kind = params.kind;
    if (params.state) this.state = params.state as StateFilter;
    if (params.id && params.id !== this.selected) this.select(params.id, false);
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.deck.pauseAll();
  }

  private async load(): Promise<void> {
    fill(this.listEl, h('div', { class: 'muted', text: T.assets.loading }));
    const res = await this.api.list();
    if (!res.ok) {
      this.listing = null;
      // Without the dev service Vite answers with its HTML fallback (not_json) or nothing.
      this.loadError =
        res.error === 'network' || res.error === 'not_json' || res.error.startsWith('http_404')
          ? T.assets.offline
          : fmt(T.assets.loadFailed, { error: res.error });
    } else {
      this.listing = res.value;
      this.loadError = '';
    }
    this.render();
    if (this.selected) void this.loadTrail();
  }

  private async loadTrail(): Promise<void> {
    const id = this.selected;
    const res = await this.api.log(id);
    if (id !== this.selected) return;
    this.trail = res.ok ? res.value : [];
    this.renderInspector();
  }

  private pushParams(): void {
    this.host.setParams({
      id: this.selected,
      q: this.query,
      kind: this.kind === 'all' ? '' : this.kind,
      state: this.state === 'all' ? '' : this.state,
    });
  }

  private rows(): AssetRow[] {
    return filterRows(this.listing?.rows ?? [], {
      query: this.query,
      kind: this.kind,
      state: this.state,
    });
  }

  private current(): AssetRow | undefined {
    return this.listing?.rows.find((r) => r.id === this.selected);
  }

  private select(id: string, push = true): void {
    if (id === this.selected) return;
    this.deck.reset();
    this.selected = id;
    this.picks = [];
    this.compare = [];
    this.reasons = [];
    this.trail = [];
    this.noteDraft = '';
    this.confirmReplace = false;
    const status = this.current()?.record?.status;
    this.decision = status && status !== 'review' ? status : 'approved';
    if (push) this.pushParams();
    this.renderList();
    this.renderStage();
    this.renderInspector();
    void this.loadTrail();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.visible || typingInField() || e.ctrlKey || e.metaKey || e.altKey) return;
    // A focused player or button handles its own keys (space would toggle twice).
    const focused = document.activeElement?.tagName;
    if (focused === 'AUDIO' || (focused === 'BUTTON' && e.key === ' ')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.select(stepId(this.rows(), this.selected, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === ' ') {
      e.preventDefault();
      this.deck.toggleLast();
    } else if (e.key === 'l' || e.key === 'L') {
      this.deck.toggleLastLoop();
    }
  }

  private render(): void {
    this.renderChips();
    this.renderList();
    this.renderStage();
    this.renderInspector();
  }

  private renderChips(): void {
    const all = this.listing?.rows ?? [];
    const counts = stateCounts(filterRows(all, { query: '', kind: this.kind, state: 'all' }));
    const chip = (label: string, active: boolean, onClick: () => void) =>
      button(label, onClick, { class: `chip${active ? ' active' : ''}` });
    const kinds: [KindFilter, string][] = [
      ['all', T.assets.kindAll],
      ['art', T.assets.kindArt],
      ['audio', T.assets.kindAudio],
    ];
    fill(
      this.chipsEl,
      h(
        'div',
        { class: 'inline wrap' },
        ...kinds.map(([k, label]) =>
          chip(label, this.kind === k, () => {
            this.kind = k;
            this.pushParams();
            this.render();
          }),
        ),
      ),
      h(
        'div',
        { class: 'inline wrap' },
        chip(`${T.assets.stateAll} ${all.length}`, this.state === 'all', () => {
          this.state = 'all';
          this.pushParams();
          this.render();
        }),
        ...STATE_ORDER.filter((s) => counts[s]).map((s) =>
          chip(`${T.assets.states[s] ?? s} ${counts[s]}`, this.state === s, () => {
            this.state = s as StateFilter;
            this.pushParams();
            this.render();
          }),
        ),
      ),
    );
    const sum = this.listing?.summary;
    fill(
      this.summaryEl,
      ...(sum
        ? (['art', 'audio'] as const).map((k) =>
            h('div', {
              text: fmt(T.assets.summaryLine, {
                kind: k === 'art' ? T.assets.kindArt : T.assets.kindAudio,
                ...sum[k],
              }),
            }),
          )
        : []),
      this.listing && this.listing.problems.length > 0
        ? h('div', {
            class: 'bad',
            text: fmt(T.assets.poolProblems, { n: this.listing.problems.length }),
            title: this.listing.problems.join('\n'),
          })
        : null,
    );
  }

  private renderList(): void {
    if (!this.listing) {
      fill(this.listEl, h('div', { class: 'muted', text: this.loadError || T.assets.loading }));
      return;
    }
    const rows = this.rows();
    if (rows.length === 0) {
      fill(this.listEl, h('div', { class: 'muted', text: T.assets.empty }));
      return;
    }
    let n = 0;
    fill(
      this.listEl,
      rows.length > LIST_LIMIT
        ? h('div', {
            class: 'muted small',
            text: fmt(T.assets.listLimit, { n: LIST_LIMIT, total: rows.length }),
          })
        : null,
      ...groupRows(rows.slice(0, LIST_LIMIT)).map((g) =>
        h(
          'div',
          { class: 'asset-group' },
          h('div', {
            class: 'asset-group-title',
            text: `${g.kind === 'art' ? T.assets.kindArt : T.assets.kindAudio} / ${g.category}`,
          }),
          ...g.rows.map((r) => {
            n++;
            return h(
              'button',
              {
                class: `asset-row${r.id === this.selected ? ' active' : ''}`,
                on: { click: () => this.select(r.id) },
                title: r.subject?.zh ?? r.id,
              },
              h('span', { class: 'asset-num mono', text: String(n).padStart(2, '0') }),
              h(
                'span',
                { class: 'asset-row-main' },
                h('span', { class: 'mono', text: r.id }),
                h('span', { class: 'muted small asset-row-sub', text: r.subject?.zh ?? '' }),
              ),
              h('span', {
                class: `asset-dot state-${r.state}`,
                title: T.assets.states[r.state] ?? r.state,
              }),
            );
          }),
        ),
      ),
    );
  }

  private renderStage(): void {
    // Every stage rebuild drops the old players, so no hidden mixer keeps sounding.
    this.deck.reset();
    const row = this.current();
    if (!row) {
      fill(
        this.stageEl,
        h('div', { class: 'pane-title', text: T.assets.title }),
        h('p', { class: 'muted', text: this.loadError || T.assets.hint }),
        h('p', { class: 'muted', text: T.assets.pickOne }),
      );
      return;
    }
    const set = row.candidates;
    const adopted = adoptedKeys(row.record);
    const groups = candidateGroups(set);
    const head = h(
      'div',
      { class: 'asset-stage-head' },
      h('div', {
        class: 'muted small',
        text: `${row.kind === 'art' ? T.assets.kindArt : T.assets.kindAudio} / ${row.category} / ${row.template}`,
      }),
      h('div', { class: 'pane-title mono', text: row.id }),
      row.subject ? h('div', { class: 'asset-subject', text: row.subject.zh }) : null,
      row.orphan ? h('div', { class: 'bad small', text: T.assets.orphan }) : null,
    );
    const original = row.record
      ? h(
          'div',
          { class: 'asset-original' },
          h('div', {
            class: 'sub-title',
            text: fmt(T.assets.titleWithState, {
              title: T.assets.recordTitle,
              state: T.assets.states[row.record.status] ?? row.record.status,
            }),
          }),
          h('div', { class: 'mono small muted', text: row.record.file }),
          this.media(row.kind, row.record.file, row.kind === 'audio' && !row.id.startsWith('sfx_')),
        )
      : row.unregisteredFile
        ? h(
            'div',
            { class: 'asset-original' },
            h('div', { class: 'sub-title', text: T.assets.unregisteredTitle }),
            h('div', { class: 'mono small muted', text: row.unregisteredFile }),
            h('div', { class: 'muted small', text: T.assets.unregisteredHint }),
            this.media(row.kind, row.unregisteredFile, false),
          )
        : h('div', { class: 'muted small', text: T.assets.noRecord });
    this.cardViews.clear();
    this.compareHost = h('div', null, this.compareBlock(set?.candidates ?? []));
    this.adoptHost = h('div', null, this.adoptBar(row));
    const pool = set
      ? h(
          'div',
          { class: 'asset-pool' },
          h('div', {
            class: 'sub-title',
            text: fmt(T.assets.candidatesTitle, { n: set.candidates.length }),
          }),
          h('div', {
            class: 'muted small',
            text:
              set.adoptMode === 'sequence'
                ? fmt(T.assets.sequenceHint, { n: set.adoptCount || 1 })
                : T.assets.candidatesHint,
          }),
          this.compareHost,
          ...groups.map((g) =>
            h(
              'div',
              { class: 'asset-cand-group' },
              h('div', {
                class: 'asset-group-title',
                text: fmt(T.assets.groupTitle, { group: g.group }),
              }),
              h(
                'div',
                { class: 'asset-cards' },
                ...g.candidates.map((c) => this.card(row, c, adopted.includes(c.key))),
              ),
            ),
          ),
          this.adoptHost,
        )
      : null;
    const processed =
      row.processed && row.processed.length > 0
        ? h(
            'div',
            { class: 'asset-original' },
            h('div', { class: 'sub-title', text: T.assets.processedTitle }),
            ...row.processed.map((f) =>
              h(
                'div',
                null,
                h('div', { class: 'mono small muted', text: f }),
                this.media(row.kind, f, row.kind === 'audio' && !row.id.startsWith('sfx_')),
              ),
            ),
          )
        : null;
    fill(this.stageEl, head, original, processed, pool);
  }

  private media(kind: 'art' | 'audio', path: string, loop: boolean): HTMLElement {
    const url = assetUrl(path);
    if (kind === 'audio' && !isImagePath(path)) return this.deck.take(url, loop);
    const img = h('img', { src: url, alt: path, class: 'asset-img zoom-1' });
    const zoom = (z: number) =>
      button(z === 1 ? T.assets.zoom1 : T.assets.zoom3, () => {
        img.className = `asset-img zoom-${z}`;
      });
    return h(
      'div',
      { class: 'asset-image' },
      h('div', { class: 'toolbar' }, zoom(1), zoom(3)),
      h('div', { class: 'asset-checker' }, img),
    );
  }

  private card(row: AssetRow, c: Candidate, isAdopted: boolean): HTMLElement {
    const main = c.files.find((f) => f.role === 'main');
    const layers = c.files.filter((f) => f.role === 'layer');
    const mode = row.candidates?.adoptMode ?? 'single';
    const isLoopy = row.kind === 'audio' && !row.id.startsWith('sfx_');
    const cmp =
      row.kind === 'audio'
        ? button(T.assets.compare, () => this.toggleCompare(row, c.key), { class: 'chip' })
        : null;
    const pick = button(T.assets.pick, () => this.togglePickOf(row, c.key, mode), {
      class: 'chip',
    });
    const card = h(
      'div',
      { class: `asset-card${isAdopted ? ' adopted' : ''}` },
      h(
        'div',
        { class: 'asset-card-head' },
        h('span', { class: 'mono', text: c.key }),
        isAdopted ? h('span', { class: 'pill ok', text: T.assets.current }) : null,
        h('span', { class: 'spacer' }),
        cmp,
        pick,
      ),
      h('div', { class: 'small', text: c.label }),
      main ? this.media(row.kind, main.path, isLoopy) : null,
      layers.length > 0
        ? this.deck.layers(layers.map((f) => ({ label: f.label, url: assetUrl(f.path) })))
        : null,
      h('div', {
        class: 'muted small',
        text: [metricText(c.metrics), c.seed ? `seed ${c.seed}` : ''].filter(Boolean).join(' / '),
      }),
    );
    this.cardViews.set(c.key, { card, pick, cmp });
    this.paintCard(c.key, mode);
    return card;
  }

  private paintCard(key: string, mode: 'single' | 'sequence'): void {
    const v = this.cardViews.get(key);
    if (!v) return;
    const order = this.picks.indexOf(key);
    v.card.classList.toggle('picked', order >= 0);
    v.pick.classList.toggle('active', order >= 0);
    v.pick.textContent =
      order >= 0 && mode === 'sequence' ? `${T.assets.pick} ${order + 1}` : T.assets.pick;
    v.cmp?.classList.toggle('active', this.compare.includes(key));
  }

  private togglePickOf(row: AssetRow, key: string, mode: 'single' | 'sequence'): void {
    this.picks = togglePick(this.picks, key, mode);
    for (const k of this.cardViews.keys()) this.paintCard(k, mode);
    if (this.adoptHost) fill(this.adoptHost, this.adoptBar(row));
    this.renderInspector();
  }

  private toggleCompare(row: AssetRow, key: string): void {
    this.compare = this.compare.includes(key)
      ? this.compare.filter((k) => k !== key)
      : [...this.compare, key].slice(-2);
    const mode = row.candidates?.adoptMode ?? 'single';
    for (const k of this.cardViews.keys()) this.paintCard(k, mode);
    if (this.compareHost)
      fill(this.compareHost, this.compareBlock(row.candidates?.candidates ?? []));
  }

  private compareBlock(candidates: Candidate[]): HTMLElement | null {
    if (this.compare.length !== 2) {
      return h('div', { class: 'muted small', text: T.assets.compareHint });
    }
    const [a, b] = this.compare.map((k) => candidates.find((c) => c.key === k));
    const fa = a?.files.find((f) => f.role === 'main');
    const fb = b?.files.find((f) => f.role === 'main');
    if (!a || !b || !fa || !fb) return null;
    return h(
      'div',
      { class: 'asset-compare' },
      h('div', { class: 'sub-title', text: T.assets.compare }),
      this.deck.ab(assetUrl(fa.path), assetUrl(fb.path), a.key, b.key),
    );
  }

  private adoptBar(row: AssetRow): HTMLElement {
    const replace = row.record?.status === 'approved' || row.record?.status === 'retired';
    const label = !replace
      ? T.assets.adopt
      : this.confirmReplace
        ? T.assets.confirmReplace
        : T.assets.adoptReplace;
    const adoptBtn = button(
      label,
      () => {
        if (replace && !this.confirmReplace) {
          this.confirmReplace = true;
          if (this.adoptHost) fill(this.adoptHost, this.adoptBar(row));
          return;
        }
        void this.adopt(row, replace);
      },
      { class: replace && this.confirmReplace ? 'primary danger' : 'primary' },
    );
    adoptBtn.disabled = this.picks.length === 0 || this.busy;
    return h(
      'div',
      { class: 'toolbar asset-adopt' },
      h('span', { class: 'muted small', text: fmt(T.assets.picked, { n: this.picks.length }) }),
      h('span', { class: 'mono small', text: this.picks.join(' + ') }),
      h('span', { class: 'spacer' }),
      adoptBtn,
    );
  }

  private errorText(error: string, details: string[]): string {
    const template = T.assets.errors[error];
    return template
      ? fmt(template, { details: details.join('; ') })
      : [error, ...details].join(': ');
  }

  private async adopt(row: AssetRow, replace: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.confirmReplace = false;
    if (this.adoptHost) fill(this.adoptHost, this.adoptBar(row));
    const res = await this.api.adopt({
      id: row.id,
      keys: this.picks,
      reviewer: this.reviewerDraft,
      note: '',
      replace,
    });
    this.busy = false;
    if (!res.ok) {
      this.host.notify(this.errorText(res.error, res.details), 'error');
      if (this.adoptHost) fill(this.adoptHost, this.adoptBar(row));
      return;
    }
    this.host.notify(fmt(T.assets.adopted, { keys: this.picks.join(' + ') }), 'ok');
    this.picks = [];
    this.decision = 'approved';
    await this.load();
  }

  private renderInspector(): void {
    const row = this.current();
    if (!row) {
      fill(this.inspectorEl);
      return;
    }
    const dl = (pairs: [string, string | undefined][]) =>
      h(
        'dl',
        { class: 'asset-dl' },
        ...pairs
          .filter(([, v]) => v)
          .flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v ?? '' })]),
      );
    const F = T.assets.fields;
    const rec = row.record;
    const entry = h(
      'div',
      { class: 'asset-section' },
      h('div', { class: 'sub-title', text: T.assets.entry }),
      dl([
        [F.id, row.id],
        [F.template, row.template],
        [F.milestone, row.milestone],
        [F.category, row.category],
        [F.file, row.file],
        [F.subject, row.subject ? `${row.subject.zh}\n${row.subject.en}` : undefined],
      ]),
    );
    const record = rec
      ? h(
          'div',
          { class: 'asset-section' },
          h(
            'div',
            { class: 'sub-title' },
            T.assets.recordTitle,
            h('span', {
              class: `pill state-${rec.status}`,
              text: T.assets.states[rec.status] ?? rec.status,
            }),
          ),
          dl([
            [
              F.reason,
              rec.reason
                ? rec.reason
                    .split(',')
                    .map((c) => T.assets.reasonLabels[c] ?? c)
                    .join(T.assets.listSep)
                : undefined,
            ],
            [F.reviewer, rec.reviewer],
            [F.reviewedAt, rec.reviewedAt],
            [F.tool, rec.tool],
            [F.toolVersion, rec.toolVersion],
            [F.seed, rec.seed],
            [F.generatedAt, rec.generatedAt],
            [F.sha256, rec.sha256.slice(0, 16)],
            [F.notes, rec.notes],
          ]),
        )
      : null;
    const pickedInfo = this.picks
      .map((k) => row.candidates?.candidates.find((c) => c.key === k))
      .filter((c): c is Candidate => Boolean(c))
      .map((c) =>
        h(
          'div',
          { class: 'asset-section' },
          h('div', { class: 'sub-title mono', text: c.key }),
          dl([
            [F.method, c.method],
            [F.tool, `${c.tool} / ${c.toolVersion}`],
            [F.models, c.models.join(', ')],
            [F.seed, c.seed],
            [F.generatedAt, c.generatedAt],
            [F.metrics, metricText(c.metrics)],
            [F.prompt, c.prompt],
          ]),
        ),
      );
    fill(
      this.inspectorEl,
      entry,
      ...pickedInfo,
      record,
      rec ? this.decisionForm(row) : null,
      row.state === 'unregistered'
        ? h('div', { class: 'muted small', text: T.assets.unregisteredHint })
        : null,
      this.trailView(),
    );
  }

  private decisionForm(row: AssetRow): HTMLElement {
    const codes = this.listing?.reasonCodes[row.kind] ?? [];
    const reviewerEl = h('input', {
      type: 'text',
      value: this.reviewerDraft,
      attrs: { 'aria-label': T.assets.reviewerLabel },
    });
    reviewerEl.addEventListener('input', () => {
      this.reviewerDraft = reviewerEl.value;
    });
    const noteEl = h('textarea', {
      rows: 4,
      value: this.noteDraft,
      placeholder: T.assets.notePlaceholder,
      attrs: { 'aria-label': T.assets.note },
    });
    noteEl.addEventListener('input', () => {
      this.noteDraft = noteEl.value;
    });
    const needsReason = this.decision === 'rework' || this.decision === 'rejected';
    const submit = button(
      T.assets.submit,
      () => {
        const reviewer = reviewerEl.value.trim();
        const problems = decisionProblems(this.decision, this.reasons, reviewer);
        if (problems.length > 0) {
          this.host.notify(
            problems
              .map((p) => (p === 'needReason' ? T.assets.needReason : T.assets.needReviewer))
              .join(' '),
            'error',
          );
          return;
        }
        saveReviewer(reviewer);
        void this.submit(row, reviewer, noteEl.value);
      },
      { class: 'primary' },
    );
    submit.disabled = this.busy;
    return h(
      'div',
      { class: 'asset-section asset-decision' },
      h('div', { class: 'sub-title', text: T.assets.decisionTitle }),
      h(
        'div',
        { class: 'inline wrap' },
        ...DECISIONS.map((s) =>
          button(
            T.assets.decisions[s] ?? s,
            () => {
              this.decision = s;
              if (s !== 'rework' && s !== 'rejected') this.reasons = [];
              this.renderInspector();
            },
            { class: `chip decision-${s}${this.decision === s ? ' active' : ''}` },
          ),
        ),
      ),
      needsReason
        ? h(
            'div',
            null,
            h('div', { class: 'muted small', text: T.assets.reasonsTitle }),
            h(
              'div',
              { class: 'inline wrap' },
              ...codes.map((code) =>
                button(
                  T.assets.reasonLabels[code] ?? code,
                  () => {
                    this.reasons = this.reasons.includes(code)
                      ? this.reasons.filter((c) => c !== code)
                      : [...this.reasons, code];
                    this.renderInspector();
                  },
                  { class: `chip${this.reasons.includes(code) ? ' active' : ''}`, title: code },
                ),
              ),
            ),
          )
        : null,
      h('label', { class: 'small muted', text: T.assets.note }),
      noteEl,
      h('label', { class: 'small muted', text: T.assets.reviewerLabel }),
      reviewerEl,
      h('div', { class: 'toolbar' }, h('span', { class: 'spacer' }), submit),
    );
  }

  private async submit(row: AssetRow, reviewer: string, note: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.renderInspector();
    const res = await this.api.review({
      id: row.id,
      status: this.decision,
      reasons: this.reasons,
      note,
      reviewer,
    });
    this.busy = false;
    if (!res.ok) {
      this.host.notify(this.errorText(res.error, res.details), 'error');
      this.renderInspector();
      return;
    }
    this.host.notify(
      fmt(T.assets.saved, {
        id: row.id,
        status: T.assets.states[res.value.record.status] ?? res.value.record.status,
      }),
      'ok',
    );
    this.reasons = [];
    this.noteDraft = '';
    await this.load();
  }

  private trailView(): HTMLElement {
    const items = [...this.trail].reverse().map((e) =>
      h(
        'li',
        null,
        h('span', { class: 'mono small muted', text: e.at.slice(0, 16).replace('T', ' ') }),
        ' ',
        h('span', {
          text:
            e.action === 'adopt'
              ? fmt(T.assets.trailAdopt, { keys: (e.candidates ?? []).join(' + ') })
              : fmt(T.assets.trailReview, { status: T.assets.states[e.status] ?? e.status }),
        }),
        e.reason
          ? h('span', {
              class: 'muted small',
              text: fmt(T.assets.paren, {
                text: e.reason
                  .split(',')
                  .map((c) => T.assets.reasonLabels[c] ?? c)
                  .join(T.assets.listSep),
              }),
            })
          : null,
        e.reviewer ? h('span', { class: 'muted small', text: ` ${e.reviewer}` }) : null,
        e.note ? h('div', { class: 'small asset-trail-note', text: e.note }) : null,
      ),
    );
    return h(
      'div',
      { class: 'asset-section' },
      h('div', { class: 'sub-title', text: T.assets.trailTitle }),
      items.length > 0
        ? h('ul', { class: 'asset-trail' }, ...items)
        : h('div', { class: 'muted small', text: T.assets.trailEmpty }),
    );
  }
}

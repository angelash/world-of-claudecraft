// Reveal-ledger review: locked terms and what each knowledge tier may know at the
// current flags (or at a chosen act), and every hit of locked terms or lore keywords in
// the AI audit records, in all content texts, and in the live event stream, with jump
// links. Thin DOM layer over leak_review.ts.

import type { AuditLog } from '../../ai/audit';
import type { FlagValue } from '../../core/contracts';
import { rowTargetForPath } from '../checks/rules';
import { targetLinks } from '../checks/target_links';
import { append, button, clear, h, select } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { GameSession } from '../state/game_session';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import {
  type FlagWorld,
  flagWorldAt,
  KNOWLEDGE_TIERS,
  knowledgeByTier,
  type LeakHit,
  lockedTermList,
  loreOf,
  reviewData,
  reviewEvents,
  reviewRecords,
  termCounts,
} from './leak_review';

type GameModule = typeof import('../../game/create');

export class LedgerTool implements EditorTool {
  readonly id = 'ledger';
  readonly label = T.nav.ledger;
  private host!: ToolHost;
  private ws!: Workspace;
  private source: 'live' | 'fresh' = 'live';
  private act = '';
  private freshFlags: Record<string, FlagValue> | null = null;
  private toolbarEl!: HTMLElement;
  private outEl!: HTMLElement;

  constructor(
    private readonly session: GameSession,
    private readonly audit: AuditLog,
  ) {}

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.toolbarEl = h('div', { class: 'toolbar wrap' });
    this.outEl = h('div', { class: 'ledger-out' });
    append(root, h('div', { class: 'ledger-tool pane' }, this.toolbarEl, this.outEl));
  }

  show(): void {
    this.renderToolbar();
  }

  hide(): void {}

  private renderToolbar(): void {
    const content = this.session.game?.content ?? this.ws.content();
    const acts = (content as unknown as { acts?: { id: string; title: string }[] }).acts ?? [];
    clear(this.toolbarEl);
    append(
      this.toolbarEl,
      h(
        'label',
        { class: 'check' },
        T.ledger.flagsFrom,
        select(
          [
            { value: 'live', label: T.ledger.fromLive },
            { value: 'fresh', label: T.ledger.fromFresh },
          ],
          this.source,
          (v) => {
            this.source = v as 'live' | 'fresh';
          },
        ),
      ),
      h(
        'label',
        { class: 'check' },
        T.ledger.actOverride,
        select(
          [
            { value: '', label: T.ledger.noOverride },
            ...acts.map((a) => ({ value: a.id, label: a.title })),
          ],
          this.act,
          (v) => {
            this.act = v;
          },
        ),
      ),
      button(T.ledger.run, () => void this.run(), { class: 'primary' }),
    );
  }

  private async baseWorld(): Promise<FlagWorld> {
    const live = this.session.game?.engine.world;
    if (this.source === 'live' && live) return live;
    if (!this.freshFlags) {
      const mod: GameModule = await import('../../game/create');
      this.freshFlags = {
        ...mod.createGame({ aiMode: 'off', content: this.ws.content() }).world.meta.flags,
      };
    }
    return { meta: { flags: this.freshFlags } };
  }

  private async run(): Promise<void> {
    clear(this.outEl);
    this.outEl.append(h('p', { class: 'muted', text: T.ledger.running }));
    try {
      const content = this.session.game?.content ?? this.ws.content();
      if (!loreOf(content)) {
        clear(this.outEl);
        this.outEl.append(h('p', { class: 'bad', text: T.ledger.noLore }));
        return;
      }
      const world = flagWorldAt(await this.baseWorld(), this.act ? { act: this.act } : {});
      const locked = lockedTermList(world, content);
      const tiers = knowledgeByTier(world, content);
      const auditHits = reviewRecords(this.audit.list(), world, content);
      const dataHits = reviewData(this.ws.allData(), world, content);
      const events = this.session.game?.engine.world.recent ?? [];
      const eventHits = reviewEvents(events, world, content);
      clear(this.outEl);
      const lockedTable = h('table', { class: 'grid' });
      lockedTable.append(
        h(
          'tr',
          null,
          ...[T.ledger.term, T.ledger.replacement, T.ledger.unlock].map((t) =>
            h('th', { text: t }),
          ),
        ),
      );
      for (const t of locked) {
        lockedTable.append(
          h(
            'tr',
            null,
            h('td', { text: t.term }),
            h('td', { text: t.replacement }),
            h('td', { class: 'mono', text: t.unlock }),
          ),
        );
      }
      const tierBox = h('div', null);
      for (const t of KNOWLEDGE_TIERS) {
        tierBox.append(
          h(
            'details',
            null,
            h('summary', { text: fmt(T.ledger.tierCount, { tier: t, n: tiers[t].length }) }),
            h('ul', { class: 'problem-list' }, ...tiers[t].map((line) => h('li', { text: line }))),
          ),
        );
      }
      append(
        this.outEl,
        h(
          'details',
          { open: true },
          h('summary', { text: fmt(T.ledger.lockedTitle, { n: locked.length }) }),
          lockedTable,
        ),
        h('details', null, h('summary', { text: T.ledger.tiersTitle }), tierBox),
        this.hitSection(fmt(T.ledger.auditTitle, { n: auditHits.length }), auditHits, (hit) => [
          button(T.audit.openAudit, () => this.host.navigate('audit', { id: hit.source }), {
            class: 'link small',
          }),
        ]),
        this.hitSection(
          fmt(T.ledger.dataTitle, { n: dataHits.length }),
          dataHits,
          (hit) =>
            targetLinks(
              rowTargetForPath(
                { schemas: this.ws.schemas, files: this.ws.allData(), problems: [] },
                hit.source,
                hit.path,
              ),
              this.host,
            ),
          T.ledger.dataHelp,
        ),
        this.hitSection(fmt(T.ledger.eventsTitle, { n: eventHits.length }), eventHits, () => []),
      );
    } catch (e) {
      clear(this.outEl);
      this.outEl.append(h('p', { class: 'bad', text: errorMessage(e) }));
    }
  }

  private hitSection(
    title: string,
    hits: readonly LeakHit[],
    links: (hit: LeakHit) => HTMLElement[],
    help?: string,
  ): HTMLElement {
    const box = h('details', { open: hits.length > 0 }, h('summary', { text: title }));
    if (help) box.append(h('p', { class: 'muted small', text: help }));
    if (hits.length === 0) {
      box.append(h('p', { class: 'muted', text: T.ledger.noHits }));
      return box;
    }
    box.append(
      h(
        'p',
        { class: 'small' },
        `${T.ledger.termCounts}：`,
        termCounts(hits)
          .map((c) => `${c.term} ${c.count}`)
          .join('，'),
      ),
    );
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[T.ledger.colSource, T.ledger.colPath, T.ledger.colTerms, T.ledger.colSnippet, ''].map(
          (t) => h('th', { text: t }),
        ),
      ),
    );
    for (const hit of hits.slice(0, 500)) {
      table.append(
        h(
          'tr',
          null,
          h('td', { class: 'mono small', text: hit.source }),
          h('td', { class: 'mono small', text: hit.path }),
          h('td', { class: 'bad', text: hit.terms.join('、') }),
          h('td', { text: hit.snippet }),
          h('td', null, ...links(hit)),
        ),
      );
    }
    box.append(table);
    return box;
  }
}

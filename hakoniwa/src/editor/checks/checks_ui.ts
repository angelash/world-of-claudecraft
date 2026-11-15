// Content check desk: runs validateContent and the static rules over every data file
// (drafts included) in one go, lists the issues with severity and rule filters, and
// jumps to the table row or the map cell an issue points at. Thin DOM layer over
// rules.ts.

import { append, button, checkbox, clear, fill, h } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import { type Issue, RULE_LABELS, type RuleId, runChecks, type Severity } from './rules';
import { targetLinks } from './target_links';

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

export class ChecksTool implements EditorTool {
  readonly id = 'checks';
  readonly label = T.nav.checks;
  private host!: ToolHost;
  private ws!: Workspace;
  private issues: Issue[] | null = null;
  private visible = false;
  private rerunTimer = 0;
  private ranAt = -1;
  private readonly showSeverity: Record<Severity, boolean> = {
    error: true,
    warning: true,
    info: false,
  };
  private rule: RuleId | '' = '';
  private toolbarEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private listEl!: HTMLElement;

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.toolbarEl = h('div', { class: 'toolbar wrap' });
    this.summaryEl = h('div', { class: 'summary' });
    this.listEl = h('div', { class: 'table-wrap' });
    append(
      root,
      h('div', { class: 'checks-tool pane' }, this.toolbarEl, this.summaryEl, this.listEl),
    );
    // Keep the list current while it is on screen (debounced: edits come in bursts).
    this.ws.subscribe(() => {
      if (!this.visible) return;
      clearTimeout(this.rerunTimer);
      this.rerunTimer = window.setTimeout(() => {
        if (this.visible && this.ranAt !== this.ws.revision) this.run();
      }, 400);
    });
  }

  show(): void {
    this.visible = true;
    // Re-run automatically when the data changed since the last run.
    if (this.issues === null || this.ranAt !== this.ws.revision) this.run();
    else this.render();
  }

  hide(): void {
    this.visible = false;
  }

  private run(): void {
    try {
      this.issues = runChecks({
        schemas: this.ws.schemas,
        files: this.ws.allData(),
        problems: this.ws.problems(),
      });
    } catch (e) {
      this.issues = [];
      this.host.notify(errorMessage(e), 'error');
    }
    this.ranAt = this.ws.revision;
    this.render();
  }

  private render(): void {
    const issues = this.issues ?? [];
    fill(
      this.toolbarEl,
      button(T.checks.run, () => this.run(), { class: 'primary' }),
      ...SEVERITIES.map((s) =>
        checkbox(
          `${T.severity[s]}（${issues.filter((i) => i.severity === s).length}）`,
          this.showSeverity[s],
          (v) => {
            this.showSeverity[s] = v;
            this.render();
          },
        ),
      ),
    );
    clear(this.summaryEl);
    const counts = new Map<RuleId, number>();
    for (const i of issues) counts.set(i.rule, (counts.get(i.rule) ?? 0) + 1);
    this.summaryEl.append(
      h('span', {
        class: 'muted',
        text: issues.length ? fmt(T.checks.summary, { n: issues.length }) : T.checks.none,
      }),
      ' ',
      button(
        `${T.common.all}`,
        () => {
          this.rule = '';
          this.render();
        },
        { class: `chip${this.rule === '' ? ' active' : ''}` },
      ),
    );
    for (const [rule, n] of counts) {
      this.summaryEl.append(
        button(
          `${RULE_LABELS[rule]} ${n}`,
          () => {
            this.rule = rule;
            this.render();
          },
          { class: `chip${this.rule === rule ? ' active' : ''}` },
        ),
      );
    }
    const shown = issues.filter(
      (i) => this.showSeverity[i.severity] && (!this.rule || i.rule === this.rule),
    );
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[T.common.severity, T.common.rule, T.common.message, T.common.location].map((t) =>
          h('th', { text: t }),
        ),
      ),
    );
    for (const i of shown) {
      table.append(
        h(
          'tr',
          null,
          h('td', null, h('span', { class: `sev ${i.severity}`, text: T.severity[i.severity] })),
          h('td', { text: RULE_LABELS[i.rule] }),
          h('td', { text: i.message }),
          h('td', null, ...targetLinks(i.target, this.host)),
        ),
      );
    }
    fill(this.listEl, shown.length ? table : h('p', { class: 'muted', text: T.checks.none }));
  }
}

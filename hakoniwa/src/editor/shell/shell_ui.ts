// Workbench shell: tool navigation on the left, the active tool in the main area, and
// a status bar (dev service, model service, content validation, unsaved files).
// Routing lives in the URL hash so a reload returns to the same tool and selection.

import { type DataApi, summarizeLlm } from '../api/data_client';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { button, fill, h } from './dom';
import { formatRoute, parseRoute, type Route } from './route';
import type { EditorTool, NoticeKind, ToolHost } from './tool';

export interface ShellOptions {
  root: HTMLElement;
  ws: Workspace;
  api: DataApi;
  tools: EditorTool[];
  /** nav entries that are placeholders until phase two */
  later: { id: string; label: string }[];
  defaultTool: string;
}

export class Shell implements ToolHost {
  readonly ws: Workspace;
  private readonly api: DataApi;
  private readonly tools = new Map<string, EditorTool>();
  private readonly toolRoots = new Map<string, HTMLElement>();
  private readonly mounted = new Set<string>();
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private readonly main: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly defaultTool: string;
  private current: Route | null = null;
  private llmText = T.status.llmUnknown;
  private llmTitle = '';
  private noticeTimer = 0;

  constructor(opts: ShellOptions) {
    this.ws = opts.ws;
    this.api = opts.api;
    this.defaultTool = opts.defaultTool;
    for (const t of opts.tools) this.tools.set(t.id, t);

    const nav = h('nav', { class: 'app-nav' });
    for (const t of opts.tools) {
      const b = button(t.label, () => this.navigate(t.id), { class: 'nav-item' });
      this.navButtons.set(t.id, b);
      nav.append(b);
    }
    if (opts.later.length) {
      nav.append(h('div', { class: 'nav-section', text: T.nav.phase2 }));
      for (const l of opts.later) {
        nav.append(
          h('button', {
            type: 'button',
            class: 'nav-item later',
            text: l.label,
            title: T.nav.phase2Hint,
            disabled: true,
          }),
        );
      }
    }

    this.titleEl = h('span', { class: 'tool-title' });
    this.banner = h('div', { class: 'banner readonly', text: T.readOnlyBanner, hidden: true });
    this.main = h('main', { class: 'app-main' }, this.banner);
    this.statusEl = h('div', { class: 'status-items' });
    this.noticeEl = h('div', { class: 'status-notice' });

    fill(
      opts.root,
      h(
        'div',
        { class: 'app' },
        h(
          'header',
          { class: 'app-header' },
          h('span', { class: 'brand', text: T.appShort }),
          this.titleEl,
        ),
        nav,
        this.main,
        h('footer', { class: 'app-status' }, this.statusEl, this.noticeEl),
      ),
    );

    this.ws.subscribe(() => this.renderStatus());
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('beforeunload', (e) => {
      // Drafts survive in session storage; warn only when storage is unavailable.
      if (this.ws.dirtyFiles().length > 0 && !hasSessionStorage()) e.preventDefault();
    });
  }

  start(): void {
    this.renderStatus();
    this.route();
    void this.refreshLlm();
    // A save makes Vite reload the page; show the notice that was up just before.
    const last = readLastNotice();
    if (last) this.notify(last.message, last.kind);
  }

  navigate(tool: string, params: Record<string, string> = {}): void {
    const hash = formatRoute({ tool, params });
    if (location.hash === hash) this.route();
    else location.hash = hash;
  }

  setParams(params: Record<string, string>): void {
    if (!this.current) return;
    this.current = { tool: this.current.tool, params };
    history.replaceState(null, '', formatRoute(this.current));
  }

  notify(message: string, kind: NoticeKind = 'info'): void {
    writeLastNotice(message, kind);
    this.noticeEl.textContent = message;
    this.noticeEl.className = `status-notice ${kind}`;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeEl.textContent = '';
    }, 6000);
  }

  async retry(): Promise<void> {
    await this.ws.retry();
    await this.refreshLlm();
  }

  // -------------------------------------------------------------------------

  private route(): void {
    const route = parseRoute(location.hash, this.defaultTool);
    const tool = this.tools.get(route.tool) ?? this.tools.get(this.defaultTool);
    if (!tool) return;
    if (this.current && this.current.tool !== tool.id) this.tools.get(this.current.tool)?.hide();
    this.current = { tool: tool.id, params: route.params };
    let root = this.toolRoots.get(tool.id);
    if (!root) {
      root = h('section', { class: 'tool-root', attrs: { 'data-tool': tool.id } });
      this.toolRoots.set(tool.id, root);
      this.main.append(root);
    }
    for (const [id, el] of this.toolRoots) el.hidden = id !== tool.id;
    for (const [id, b] of this.navButtons) b.classList.toggle('active', id === tool.id);
    this.titleEl.textContent = tool.label;
    document.title = `${tool.label} | ${T.appTitle}`;
    if (!this.mounted.has(tool.id)) {
      this.mounted.add(tool.id);
      tool.mount(root, this);
    }
    tool.show(route.params);
  }

  private async refreshLlm(): Promise<void> {
    const res = await this.api.llmStatus();
    if (!res.reachable) {
      this.llmText = T.status.llmUnreachable;
      this.llmTitle = res.message;
    } else {
      const s = summarizeLlm(res.data);
      this.llmText =
        s.enabled === false
          ? T.status.llmDisabled
          : `${T.status.llmReachable}${s.detail ? `（${s.detail}）` : ''}`;
      this.llmTitle = JSON.stringify(res.data, null, 2);
    }
    this.renderStatus();
  }

  private renderStatus(): void {
    const ws = this.ws;
    const apiText =
      ws.apiState === 'available'
        ? T.status.apiAvailable
        : ws.apiState === 'unavailable'
          ? T.status.apiUnavailable
          : T.status.apiUnknown;
    this.banner.hidden = ws.apiState !== 'unavailable';
    const problems = ws.apiState === 'unknown' ? 0 : ws.problems().length;
    const dirty = ws.dirtyFiles();
    fill(
      this.statusEl,
      h(
        'span',
        {
          class: `pill ${ws.apiState === 'available' ? 'ok' : ws.apiState === 'unavailable' ? 'bad' : ''}`,
          title: ws.apiMessage,
        },
        `${T.status.api}：${apiText}`,
      ),
      h('span', { class: 'pill', title: this.llmTitle }, `${T.status.llm}：${this.llmText}`),
      h(
        'button',
        {
          type: 'button',
          class: `pill link ${problems > 0 ? 'bad' : 'ok'}`,
          on: { click: () => this.navigate('checks') },
        },
        `${T.status.problems}：${fmt(T.checks.summary, { n: problems })}`,
      ),
      h(
        'span',
        { class: `pill ${dirty.length ? 'warn' : ''}`, title: dirty.join('\n') },
        `${T.status.dirty}：${dirty.length}`,
      ),
      button(T.status.retry, () => void this.retry(), { class: 'pill link' }),
    );
  }
}

const NOTICE_KEY = 'hakoniwa.editor.notice';
const NOTICE_TTL_MS = 8000;

function writeLastNotice(message: string, kind: NoticeKind): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ message, kind, at: Date.now() }));
  } catch {
    // no storage: the notice simply does not survive a reload
  }
}

function readLastNotice(): { message: string; kind: NoticeKind } | null {
  try {
    const raw = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    const v = raw
      ? (JSON.parse(raw) as { message?: string; kind?: NoticeKind; at?: number })
      : null;
    if (!v?.message || !v.at || Date.now() - v.at > NOTICE_TTL_MS) return null;
    return { message: v.message, kind: v.kind ?? 'info' };
  } catch {
    return null;
  }
}

function hasSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

// Entry of editor.html: the editor and visual review workbench
// (docs/50_tech/architecture.md 8). Builds the shared workspace over the dev service
// (with the bundled data as a read-only fallback), the shared live game session and AI
// audit log, then the shell and its tools.

import './editor.css';
import { AuditLog, httpAuditSink } from '../ai/audit';
import { allPacks, allSchemas, buildContent } from '../content';
import { createDataApi, fetchAuditPage } from './api/data_client';
import { AuditTool } from './audit/audit_ui';
import { BalanceTool } from './balance/balance_ui';
import { ChecksTool } from './checks/checks_ui';
import { ContentTool } from './content/content_ui';
import { AiControls } from './inspector/ai_controls';
import { InspectorTool } from './inspector/inspector_ui';
import { LedgerTool } from './ledger/ledger_ui';
import { MapTool } from './map/map_ui';
import { QuestGraphTool } from './quests/quest_graph_ui';
import { h } from './shell/dom';
import { Shell } from './shell/shell_ui';
import { GameSession } from './state/game_session';
import { staticDataFiles } from './state/static_data';
import { type StorageLike, Workspace } from './state/workspace';
import { fmt, T } from './text';

function sessionStore(): StorageLike | undefined {
  try {
    const s = window.sessionStorage;
    s.setItem('hakoniwa.editor.probe', '1');
    s.removeItem('hakoniwa.editor.probe');
    return s;
  } catch {
    return undefined;
  }
}

async function start(): Promise<void> {
  document.title = T.appTitle;
  const root = document.getElementById('app') ?? document.body.appendChild(h('div', { id: 'app' }));
  const fetchFn = (url: string, init?: Parameters<typeof fetch>[1]) => fetch(url, init);
  const api = createDataApi(fetchFn, '', {
    network: T.api.networkError,
    notJson: T.api.notJson,
    http: (status) => fmt(T.api.httpError, { status }),
  });
  const packs = allPacks();
  const ws = new Workspace({
    api,
    schemas: allSchemas(packs),
    packs,
    baseContent: buildContent(packs),
    staticFiles: staticDataFiles(),
    storage: sessionStore(),
  });
  // One audit log for the page: records survive new worlds and also go to the dev
  // server's .local/audit.jsonl (best effort) for the history view.
  const audit = new AuditLog({ capacity: 2000, sink: httpAuditSink() });
  const session = new GameSession();
  let shell: Shell | null = null;
  const ai = new AiControls({ audit, clock: { now: () => performance.now() } }, (message, kind) =>
    shell?.notify(message, kind),
  );
  shell = new Shell({
    root,
    ws,
    api,
    tools: [
      new ContentTool(),
      new MapTool(),
      new InspectorTool(session, ai),
      new AuditTool(session, audit, (q) => fetchAuditPage(fetchFn, q)),
      new LedgerTool(session, audit),
      new QuestGraphTool(),
      new BalanceTool(),
      new ChecksTool(),
    ],
    later: [],
    defaultTool: 'content',
  });
  await ws.init();
  shell.start();
  if (ws.restoredDrafts.length) {
    shell.notify(`${T.content.restoredDrafts}：${ws.restoredDrafts.join(', ')}`);
  }
}

void start();

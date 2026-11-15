// The workbench tool seam. Each tool (content editor, map editor, inspector, check
// desk, and the phase-two tools) is its own module implementing EditorTool; the shell
// only mounts, shows and hides them and routes between them.

import type { Workspace } from '../state/workspace';

export type NoticeKind = 'info' | 'ok' | 'error';

export interface ToolHost {
  readonly ws: Workspace;
  /** Open a tool with params (updates the URL hash). */
  navigate(tool: string, params?: Record<string, string>): void;
  /** Update the current tool's params in the URL without re-showing it. */
  setParams(params: Record<string, string>): void;
  notify(message: string, kind?: NoticeKind): void;
}

export interface EditorTool {
  readonly id: string;
  readonly label: string;
  /** Called once, the first time the tool is shown. */
  mount(root: HTMLElement, host: ToolHost): void;
  /** Called on every navigation to the tool (params come from the URL hash). */
  show(params: Record<string, string>): void;
  hide(): void;
}

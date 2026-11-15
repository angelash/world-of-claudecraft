// Settings window: the large-model switch (AI residents and goddesses) with the proxy
// status, the degrade level and budget, and the energy-saving note.

import { el, setText } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function aiStatusText(s: ReturnType<WindowContext['settings']['ai']>): string {
  if (!s.enabled) return T.settings.aiOff;
  if (!s.available) return T.settings.aiUnavailable;
  const level = T.settings.aiLevels[Math.max(0, Math.min(4, s.level))] ?? '';
  const parts = [s.active ? T.settings.aiOn : T.settings.aiRestart, level];
  if (s.budgetCap)
    parts.push(
      fmt(T.settings.budget, { used: (s.budgetUsed ?? 0).toFixed(2), cap: s.budgetCap.toFixed(2) }),
    );
  return parts.filter(Boolean).join('  ');
}

export function settingsWindow(ctx: WindowContext): WindowContent {
  const box = el('input', { attrs: { type: 'checkbox', id: 'hk-ai-toggle' } });
  box.checked = ctx.settings.ai().enabled;
  box.addEventListener('change', () => ctx.settings.setAiEnabled(box.checked));
  const status = el('div', { className: 'hk-muted' });
  const root = el('div', { className: 'hk-settings' }, [
    el('h3', { text: T.settings.ai }),
    el('label', { className: 'hk-inv-row', attrs: { for: 'hk-ai-toggle' } }, [
      box,
      T.settings.aiEnabled,
    ]),
    status,
    el('div', { className: 'hk-muted', text: T.settings.aiRestart }),
    el('div', { className: 'hk-muted', text: T.settings.ecoHint }),
  ]);
  return {
    el: root,
    update: () => {
      const s = ctx.settings.ai();
      if (box.checked !== s.enabled && document.activeElement !== box) box.checked = s.enabled;
      setText(status, fmt(T.settings.aiStatus, { status: aiStatusText(s) }));
    },
  };
}

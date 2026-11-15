// Settings window: the large-model switch (AI residents and goddesses) with the proxy
// status, the degrade level and budget, and the energy-saving note; the display section
// picks the quality tier (art_pipeline.md 2.11) and the camera preset.

import { el, setText } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import { QUALITY_IDS, type QualityId } from '../hd2d/quality';
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

function displaySection(ctx: WindowContext): { el: HTMLElement; update(): void } {
  const select = el('select', { attrs: { id: 'hk-quality' } }) as HTMLSelectElement;
  for (const id of QUALITY_IDS) {
    const opt = el('option', { text: T.settings.qualityNames[id], attrs: { value: id } });
    select.append(opt);
  }
  select.value = ctx.actions.display().quality;
  select.addEventListener('change', () => ctx.actions.setQuality(select.value as QualityId));
  const current = el('div', { className: 'hk-muted' });
  const street = el('button', { className: 'hk-btn', text: T.settings.viewStreet });
  street.addEventListener('click', () => ctx.actions.setViewPreset('street'));
  const overview = el('button', { className: 'hk-btn', text: T.settings.viewOverview });
  overview.addEventListener('click', () => ctx.actions.setViewPreset('overview'));
  const root = el('div', {}, [
    el('h3', { text: T.settings.display }),
    el('label', { className: 'hk-inv-row', attrs: { for: 'hk-quality' } }, [
      T.settings.quality,
      select,
    ]),
    current,
    el('div', { className: 'hk-muted', text: T.settings.qualityHint }),
    el('h3', { text: T.settings.view }),
    el('div', { className: 'hk-inv-row' }, [street, overview]),
    el('div', { className: 'hk-muted', text: T.settings.viewHint }),
  ]);
  return {
    el: root,
    update: () => {
      const d = ctx.actions.display();
      if (select.value !== d.quality && document.activeElement !== select) select.value = d.quality;
      const text = !d.webgl
        ? T.settings.noWebgl
        : d.renderer === 'hd2d'
          ? T.settings.rendererHd
          : T.settings.rendererFlat;
      setText(current, text);
      street.toggleAttribute('disabled', d.renderer !== 'hd2d');
      overview.toggleAttribute('disabled', d.renderer !== 'hd2d');
    },
  };
}

export function settingsWindow(ctx: WindowContext): WindowContent {
  const display = displaySection(ctx);
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
    display.el,
  ]);
  return {
    el: root,
    update: () => {
      const s = ctx.settings.ai();
      if (box.checked !== s.enabled && document.activeElement !== box) box.checked = s.enabled;
      setText(status, fmt(T.settings.aiStatus, { status: aiStatusText(s) }));
      display.update();
    },
  };
}

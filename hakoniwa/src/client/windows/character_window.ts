// Character and abilities window: name, class, level and tier, health, resources and
// experience, stats (live pools plus equipment bonuses), and the known abilities.

import { el } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import { empty, kv, progress, rebuilder } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function characterWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.character;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-char' });
  const update = rebuilder(
    root,
    () => ad.sheet(ctx.view),
    (s) => {
      if (!s) {
        root.append(empty(T.character.noUnit));
        return;
      }
      root.append(
        el('div', { className: 'hk-char-head' }, [
          el('strong', { className: 'hk-char-name', text: s.name }),
          el('span', {
            className: 'hk-muted',
            text: [
              s.className,
              s.level !== null ? fmt(T.frames.level, { level: s.level }) : '',
              s.tierName,
            ]
              .filter(Boolean)
              .join('  '),
          }),
        ]),
      );
      if (s.hp)
        root.append(
          progress(
            s.hp.value,
            s.hp.max,
            `${T.character.hp} ${s.hp.value} / ${s.hp.max}`,
            'hk-bar-hp',
          ),
        );
      for (const r of s.resources) {
        const bar = progress(r.value, r.max, `${r.label} ${r.value} / ${r.max}`, 'hk-bar-res');
        const fill = bar.firstElementChild as HTMLElement | null;
        if (fill && r.color) fill.style.background = r.color;
        root.append(bar);
      }
      if (s.xp)
        root.append(
          progress(
            s.xp.value,
            s.xp.max,
            `${T.character.xp} ${s.xp.value} / ${s.xp.max}`,
            'hk-bar-xp',
          ),
        );
      root.append(el('h3', { text: T.character.stats }));
      root.append(
        el(
          'div',
          { className: 'hk-kv-grid' },
          s.stats.map((x) => kv(x.label, x.value)),
        ),
      );
      root.append(el('h3', { text: T.character.abilities }));
      if (s.abilities.length === 0) root.append(empty(T.hotbar.empty));
      s.abilities.forEach((ab, i) => {
        const meta = [
          i < 9 ? String(i + 1) : '',
          ab.cost ? fmt(T.character.cost, { n: ab.cost }) : '',
          ab.cooldown ? fmt(T.character.cooldown, { t: ab.cooldown }) : '',
        ]
          .filter(Boolean)
          .join('  ');
        root.append(
          el('div', { className: 'hk-card' }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: ab.name }),
              el('span', { className: 'hk-muted', text: meta }),
            ]),
            el('div', { className: 'hk-card-text', text: ab.desc }),
          ]),
        );
      });
    },
  );
  return { el: root, update };
}

// Calendar clock (Sacred Era year, season, day, time, weather) with the time controls:
// pause and the 1x, 2x, 4x speed steps (D-050). Writes are elided.

import type { Calendar } from '../../core/time';
import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { Weather } from '../../systems/world/types';
import { SPEEDS, type Speed } from '../app/clock';
import { formatDate, formatTime, timeOfDayLabel, weatherLabel } from './format';

export interface TimeControls {
  setSpeed(s: Speed): void;
  togglePause(): void;
}

export class ClockPanel {
  readonly el: HTMLElement;
  private date = el('div', { className: 'hk-clock-date' });
  private time = el('span', { className: 'hk-clock-time' });
  private tod = el('span', { className: 'hk-clock-tod' });
  private weather = el('span', { className: 'hk-clock-weather' });
  private pause: HTMLButtonElement;
  private speedBtns = new Map<Speed, HTMLButtonElement>();

  constructor(controls: TimeControls) {
    this.pause = el('button', {
      className: 'hk-btn hk-btn-small',
      text: t('ui.hud.clock.speed.pause'),
      attrs: { type: 'button', 'aria-label': t('ui.hud.clock.speed.pause') },
      on: { click: () => controls.togglePause() },
    });
    const speeds = SPEEDS.map((s) => {
      const b = el('button', {
        className: 'hk-btn hk-btn-small hk-speed',
        text:
          s === 1
            ? t('ui.hud.clock.speed.x1')
            : s === 2
              ? t('ui.hud.clock.speed.x2')
              : t('ui.hud.clock.speed.x4'),
        attrs: { type: 'button' },
        on: { click: () => controls.setSpeed(s) },
      });
      this.speedBtns.set(s, b);
      return b;
    });
    this.el = el('div', { className: 'hk-panel hk-clock' }, [
      this.date,
      el('div', { className: 'hk-clock-line' }, [this.time, this.tod, this.weather]),
      el(
        'div',
        {
          className: 'hk-clock-controls',
          attrs: { role: 'group', 'aria-label': t('ui.hud.clock.speed.label') },
        },
        [this.pause, ...speeds],
      ),
    ]);
  }

  update(cal: Calendar, weather: Weather, speed: Speed, paused: boolean): void {
    setText(this.date, formatDate(cal));
    setText(this.time, formatTime(cal));
    setText(this.tod, timeOfDayLabel(cal));
    setText(this.weather, weatherLabel(weather));
    setText(this.pause, paused ? t('ui.hud.clock.speed.resume') : t('ui.hud.clock.speed.pause'));
    setClass(this.pause, 'active', paused);
    for (const [s, b] of this.speedBtns) setClass(b, 'active', s === speed && !paused);
  }
}

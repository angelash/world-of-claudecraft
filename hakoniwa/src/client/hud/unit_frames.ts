// Player and target frames: portrait, name, level line (own level, or a strength reading
// for others), health, resource, experience and cast bars, buffs and debuffs, and the
// felt-pressure and appraisal notes for targets. Writes are elided.

import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { Entity } from '../../systems/world/types';
import type { Relation } from '../render/scene';
import { lookFromEntity } from '../sprites/look';
import { portraitCanvas, type SpriteCache } from '../sprites/sprite_cache';
import type { UnitFrameData } from '../view/adapters';
import { kindLabel, levelFromTags } from './format';

class Bar {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private last = '';
  constructor(cls: string) {
    this.fill = el('div', { className: 'hk-bar-fill' });
    this.label = el('span', { className: 'hk-bar-text' });
    this.el = el('div', { className: `hk-bar ${cls}` }, [this.fill, this.label]);
  }
  set(value: number, max: number, text: string, color?: string): void {
    const key = `${value}/${max}/${text}/${color ?? ''}`;
    if (key === this.last) return;
    this.last = key;
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    this.fill.style.width = `${pct.toFixed(1)}%`;
    if (color) this.fill.style.background = color;
    setText(this.label, text);
  }
  show(on: boolean): void {
    if (this.el.hidden === on) this.el.hidden = !on;
  }
}

export class UnitFrame {
  readonly el: HTMLElement;
  onPortrait?: () => void;
  private portrait: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private hp = new Bar('hk-bar-hp');
  private res = new Bar('hk-bar-res');
  private xp = new Bar('hk-bar-xp');
  private cast = new Bar('hk-bar-cast');
  private auras: HTMLElement;
  private noteEl: HTMLElement;
  private lookKey = '';
  private auraSig = '';

  constructor(
    private readonly cls: string,
    private readonly sprites: SpriteCache,
    /** the onboarding's name for this frame's aura row (src/client/tutorial/glow.ts) */
    aurasHud?: string,
  ) {
    this.portrait = el('div', { className: 'hk-portrait' });
    this.portrait.setAttribute('role', 'button');
    this.portrait.setAttribute('tabindex', '0');
    this.portrait.setAttribute('aria-label', t('ui.pop.charcard.title'));
    this.portrait.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onPortrait?.();
    });
    this.portrait.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      this.onPortrait?.();
    });
    this.nameEl = el('div', { className: 'hk-frame-name' });
    this.subEl = el('div', { className: 'hk-frame-sub' });
    this.noteEl = el('div', { className: 'hk-frame-note' });
    this.auras = el('div', { className: 'hk-frame-auras' });
    if (aurasHud) this.auras.dataset.hud = aurasHud;
    this.el = el('div', { className: `hk-frame ${cls}` }, [
      this.portrait,
      el('div', { className: 'hk-frame-main' }, [
        this.nameEl,
        this.subEl,
        this.hp.el,
        this.res.el,
        this.xp.el,
        this.cast.el,
        this.auras,
        this.noteEl,
      ]),
    ]);
  }

  update(
    entity: Readonly<Entity> | undefined,
    relation: Relation | null,
    data: UnitFrameData | null,
    emptyText: string,
  ): void {
    setClass(this.el, 'empty', !entity);
    if (!entity) {
      setText(this.nameEl, emptyText);
      setText(this.subEl, '');
      for (const b of [this.hp, this.res, this.xp, this.cast]) b.show(false);
      setText(this.noteEl, '');
      this.renderAuras([]);
      this.portrait.replaceChildren();
      this.lookKey = '';
      return;
    }
    const look = lookFromEntity(entity);
    // The portrait art reference is part of what the frame shows (art_pipeline.md 3.6).
    const lookKey = `${look.key}|${look.art?.portrait ?? ''}`;
    if (lookKey !== this.lookKey) {
      this.lookKey = lookKey;
      const c = portraitCanvas(this.sprites, look, 48);
      c.className = 'hk-portrait-canvas';
      this.portrait.replaceChildren(c);
    }
    setText(this.nameEl, entity.name && entity.name !== '?' ? entity.name : kindLabel(entity.kind));
    for (const r of ['self', 'hostile', 'friendly', 'neutral'])
      setClass(this.el, `rel-${r}`, relation === r);
    setClass(this.el, 'dead', !!data?.dead);
    const tagLevel = levelFromTags(entity.tags);
    const levelLine =
      data?.levelText ??
      (data?.level !== undefined && data.level !== null
        ? t('ui.common.unit.level', { level: data.level })
        : data && 'level' in data && data.level === null
          ? t('ui.common.unit.level_unknown')
          : tagLevel !== null && relation === 'self'
            ? t('ui.common.unit.level', { level: tagLevel })
            : '');
    const parts = [levelLine, data?.subtitle ?? (data ? '' : kindLabel(entity.kind))].filter(
      Boolean,
    );
    setText(this.subEl, parts.join('  '));
    if (data?.hp) {
      this.hp.show(true);
      this.hp.set(
        data.hp.value,
        data.hp.max,
        `${Math.round(data.hp.value)} / ${Math.round(data.hp.max)}`,
      );
    } else this.hp.show(false);
    const r = data?.resources?.[0];
    if (r) {
      this.res.show(true);
      this.res.set(r.value, r.max, `${r.label} ${Math.round(r.value)}`, r.color);
    } else this.res.show(false);
    if (data?.xp) {
      this.xp.show(true);
      this.xp.set(
        data.xp.value,
        data.xp.max,
        `${t('ui.win.character.xp')} ${data.xp.value} / ${data.xp.max}`,
      );
    } else this.xp.show(false);
    if (data?.cast) {
      this.cast.show(true);
      this.cast.set(data.cast.progress, 1, data.cast.name);
    } else this.cast.show(false);
    this.renderAuras(data?.auras ?? []);
    const notes = [
      data?.appraisal ? t('ui.hud.target.appraisal', { display: data.appraisal }) : '',
      data?.pressure ?? '',
    ].filter(Boolean);
    if (!data && this.cls === 'hk-frame-player') notes.push(t('ui.hud.player.pending_combat'));
    setText(this.noteEl, notes.join('  '));
  }

  private renderAuras(auras: NonNullable<UnitFrameData['auras']>): void {
    const sig = auras
      .map((a) => `${a.id}:${a.stacks}:${a.remaining === null ? '-' : Math.ceil(a.remaining)}`)
      .join('|');
    if (sig === this.auraSig) return;
    this.auraSig = sig;
    clear(this.auras);
    for (const a of auras.slice(0, 8)) {
      const time = a.remaining === null ? '' : ` ${Math.ceil(a.remaining)}`;
      const stacks = a.stacks > 1 ? ` x${a.stacks}` : '';
      this.auras.append(
        el('span', {
          className: `hk-aura${a.harmful ? ' harmful' : ''}`,
          text: `${a.name}${stacks}${time}`,
        }),
      );
    }
  }
}

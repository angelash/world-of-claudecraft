// Implements `ui_hud_party` (ux_and_onboarding.md 5.2): the painter of the party frames under
// the player frame. Rows are persistent elements updated in place (every write elided, the
// portrait drawn again only when the look changes); a click selects the member's entity. The rules
// live in ./party_model.ts.

import './party_frames.css';
import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { Entity } from '../../systems/world/types';
import { lookFromEntity } from '../sprites/look';
import { portraitCanvas, type SpriteCache } from '../sprites/sprite_cache';
import type { PartyModel, PartyRow } from './party_model';

/** Portrait size of a party frame (5.2). */
const PORTRAIT = 40;

class MiniBar {
  readonly el: HTMLElement;
  private readonly fill = el('div', { className: 'hk-bar-fill' });
  private readonly label = el('span', { className: 'hk-bar-text' });
  private last = '';
  constructor(cls: string) {
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

class PartyRowView {
  readonly el: HTMLElement;
  private readonly portrait = el('div', { className: 'hk-party-portrait' });
  private readonly name = el('div', { className: 'hk-party-name' });
  private readonly order = el('span', { className: 'hk-party-order' });
  private readonly hp = new MiniBar('hk-bar-hp');
  private readonly res = new MiniBar('hk-bar-res');
  private readonly debuffs = el('div', { className: 'hk-party-debuffs' });
  private readonly state = el('div', { className: 'hk-party-down' });
  private lookKey = '';
  private appearance: unknown = null;
  private debuffKey = '';
  entityId: string | null = null;

  constructor(onSelect: (row: PartyRowView) => void) {
    this.el = el('div', { className: 'hk-party-frame', attrs: { role: 'button' } }, [
      this.portrait,
      el('div', { className: 'hk-party-main' }, [
        el('div', { className: 'hk-party-head' }, [this.name, this.order]),
        this.hp.el,
        this.res.el,
        this.debuffs,
        this.state,
      ]),
    ]);
    this.el.addEventListener('click', () => onSelect(this));
    this.el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      onSelect(this);
    });
  }

  update(row: PartyRow, entity: Readonly<Entity> | undefined, sprites: SpriteCache): void {
    this.entityId = row.entityId;
    setText(this.name, row.name);
    setText(this.order, row.orderText);
    setClass(this.el, 'downed', row.downed);
    setText(this.state, row.downed ? t('ui.hud.party.down') : '');
    this.state.hidden = !row.downed;
    if (row.hp) {
      this.hp.show(true);
      this.hp.set(row.hp.value, row.hp.max, `${row.hp.value} / ${row.hp.max}`);
    } else this.hp.show(false);
    if (row.resource) {
      this.res.show(true);
      const r = row.resource;
      this.res.set(r.value, r.max, `${r.label} ${r.value}`, r.color);
    } else this.res.show(false);
    const dk = row.debuffs.map((d) => `${d.id}:${d.seconds ?? '-'}`).join('|');
    if (dk !== this.debuffKey) {
      this.debuffKey = dk;
      this.debuffs.replaceChildren(
        ...row.debuffs.map((d) =>
          el('span', {
            className: 'hk-aura harmful',
            text: d.seconds === null ? d.name : `${d.name} ${d.seconds}`,
          }),
        ),
      );
    }
    this.debuffs.hidden = row.debuffs.length === 0;
    if (!entity) {
      if (this.lookKey !== '') {
        this.lookKey = '';
        this.appearance = null;
        this.portrait.replaceChildren();
      }
      return;
    }
    // the look is built again only when the entity's appearance changes
    if (entity.appearance === this.appearance) return;
    this.appearance = entity.appearance;
    const look = lookFromEntity(entity);
    const key = `${look.key}|${look.art?.portrait ?? ''}`;
    if (key === this.lookKey) return;
    this.lookKey = key;
    const c = portraitCanvas(sprites, look, PORTRAIT);
    c.className = 'hk-party-portrait-canvas';
    this.portrait.replaceChildren(c);
  }
}

export class PartyFrames {
  readonly el = el('div', { className: 'hk-party' });
  private readonly rows: PartyRowView[] = [];

  constructor(
    private readonly sprites: SpriteCache,
    private readonly onSelect: (entityId: string) => void,
  ) {
    this.el.hidden = true;
  }

  /** Paint the model; `entity` reads the members' entities for their portraits. */
  update(m: PartyModel | null, entity: (id: string) => Readonly<Entity> | undefined): void {
    const shown = !!m && m.rows.length > 0;
    if (this.el.hidden === shown) this.el.hidden = !shown;
    if (!m || !shown) return;
    while (this.rows.length < m.rows.length) {
      const row = new PartyRowView((r) => {
        if (r.entityId) this.onSelect(r.entityId);
      });
      this.rows.push(row);
      this.el.append(row.el);
    }
    while (this.rows.length > m.rows.length) this.rows.pop()?.el.remove();
    // the portraits follow the entities' looks, which the model key does not carry
    m.rows.forEach((r, i) => {
      const view = this.rows[i];
      if (view) view.update(r, r.entityId ? entity(r.entityId) : undefined, this.sprites);
    });
  }
}

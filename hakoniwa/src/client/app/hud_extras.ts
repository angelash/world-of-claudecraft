// The session glue of the PK-M1-22 HUD elements (ux_and_onboarding.md 5.2, 5.4, 17.2):
// refreshes the party frames, the focus frame, the notifications and the hint bar at the HUD's
// 4 Hz, takes the notifications the event router maps, and keeps the focus unit. Thin: the rules
// live in the pure HUD models; the session calls this so it does not grow a method bank of its
// own. Pad rumble (16.7) is the audio subsystem's rumble table (src/client/audio/rumble.ts).

import { unitOf } from '../../systems/combat';
import { focusModel, toggleFocus } from '../hud/focus_model';
import type { HintContext } from '../hud/hint_model';
import type { Hud } from '../hud/hud';
import { lightNotice, type NotifyContext, type NotifySpec } from '../hud/notify_model';
import { partyModel } from '../hud/party_model';
import type { ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';
import type { SyncSettings } from './settings_schema';

export interface HudExtrasHost {
  readonly view: GameView;
  readonly adapters: ClientAdapters;
  readonly hud: Hud;
  /** the sync settings (the guidance level) */
  sync(): Readonly<SyncSettings>;
  /** a scene plays (cutscene or theatre) */
  inScene(): boolean;
  /** a conversation is open (notifications and hints wait; a loose line does not hold them) */
  talking(): boolean;
  /** a conversation with someone is open (the talk hint is done) */
  conversing(): boolean;
  /** the onboarding's say over the hint bar (its level, its in-scene bars; PK-M1-23) */
  hintContext?(base: HintContext): HintContext;
}

export class HudExtras {
  constructor(private readonly h: HudExtrasHost) {}

  private fighting(): boolean {
    const v = this.h.view;
    const me = unitOf(v.world as never, v.playerId());
    return !!me && me.combatUntil > v.tick;
  }

  private notifyCtx(): NotifyContext {
    return { held: this.h.inScene() || this.h.talking(), combat: this.fighting() };
  }

  /** A notification from the event router. */
  notify(n: NotifySpec, now: number): void {
    this.h.hud.notify.push(n, now, this.notifyCtx());
  }

  /** A light notification: why a press did nothing (5.4, never logged). */
  light(text: string, now: number): void {
    this.h.hud.notify.push(lightNotice(text), now, this.notifyCtx());
  }

  /** The focus action: the candidate becomes the focus, the same one again lets go. */
  toggleFocus(candidate: string | null): boolean {
    const hud = this.h.hud;
    const next = toggleFocus(hud.focusId, candidate);
    if (next === hud.focusId) return false;
    hud.focusId = next;
    this.refreshFocus();
    return true;
  }

  private refreshFocus(): void {
    const { view: v, adapters: a, hud } = this.h;
    const id = hud.focusId;
    const e = id ? v.entity(id) : undefined;
    const r = focusModel({
      focusId: id,
      entity: e,
      player: v.player(),
      frame: id && a.unitFrames ? a.unitFrames.unitFrame(v, id, v.playerId()) : null,
    });
    if (r.clear) hud.focusId = null;
    hud.focus.update(r.row);
  }

  /** The HUD refresh (4 Hz, or forced). */
  refresh(now: number): void {
    const { view: v, adapters: a, hud } = this.h;
    const pid = v.playerId();
    const party = a.party
      ? partyModel(a.party.companions(v), (id) => a.unitFrames?.unitFrame(v, id, pid) ?? null)
      : null;
    hud.party.update(party, (id) => v.entity(id));
    this.refreshFocus();
    const ctx = this.notifyCtx();
    hud.notify.update(now, ctx);
    const p = v.player();
    const act = v.flag('act');
    hud.hint.update(
      {
        now,
        act: typeof act === 'string' ? act : '',
        pos: p ? { x: p.x, y: p.y } : null,
        held: ctx.held,
        talkableNear: !!a.interact?.nearestTalkable(v),
        talking: this.h.conversing(),
      },
      this.hintCtx({
        guidance: this.h.sync().gameplay.guidance,
        combat: ctx.combat,
        held: ctx.held,
      }),
    );
  }

  private hintCtx(base: HintContext): HintContext {
    return this.h.hintContext ? this.h.hintContext(base) : base;
  }
}

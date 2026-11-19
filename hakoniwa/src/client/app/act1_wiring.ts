// The session glue of the PK-M1-23 interface (ux_and_onboarding.md 5.2, 6.3, 6.4, 17, 18.5):
// window availability with the act-1 discovery keys, the onboarding (src/client/tutorial/),
// the field status bar, the tide-night panel, Merca's coin badge and the offering popup, the
// save's client segment (guidance, tracking, evidence notes) and the first gamepad press that
// unlocks audio. Thin: every rule lives in a pure module; the session calls this so it does not
// grow a method bank of its own (the same seam as ./hud_extras.ts).

import type { AnyWorldEvent } from '../../core/contracts';
import { unitOf } from '../../systems/combat';
import { goddessByRole } from '../../systems/goddess/roster';
import { PadAudioUnlock } from '../audio/pad_unlock';
import { coinBadgeModel, coinUsedByEvent } from '../hud/coin_badge_model';
import { dungeonBarModel, leftItemsIn } from '../hud/dungeon_bar_model';
import { DIAN_KNOWN_FLAG } from '../hud/gauges_model';
import type { HintContext } from '../hud/hint_model';
import type { Hud } from '../hud/hud';
import type { NotifySpec } from '../hud/notify_model';
import { OfferPop } from '../hud/offer_pop';
import {
  type OfferReceipt,
  offerableItems,
  offerReceipt,
  pushReceipt,
} from '../hud/offer_pop_model';
import type { KeyValueStore } from '../hud/save_slots';
import { tidePanelModel } from '../hud/tide_panel_model';
import type { TrackerState } from '../hud/tracker_model';
import { readGamepad } from '../input/gamepad_poller';
import { TUT_EVENT_KINDS } from '../tutorial/catalog';
import { keyBase, type TutWindow } from '../tutorial/steps';
import { TutorialSession } from '../tutorial/tutorial_session';
import type { ClientAdapters, Commands } from '../view/adapters';
import { flagOn, type GameView } from '../view/game_view';
import type { HelpSource } from '../windows/help_model';
import { WINDOW_DEFS, type WindowId } from '../windows/window_registry';
import { AvailabilityFlags } from '../windows/window_unlocks';
import {
  buildClientSegment,
  type ClientSegment,
  EvidenceNotes,
  parseClientSegment,
} from './client_segment';
import {
  GUIDANCE_LEVELS,
  type GuidanceLevel,
  type SyncPatch,
  type SyncSettings,
} from './settings_schema';
import { levelSignals, newlyOpened, StorySignals } from './tut_signals';

/** Catalogue events kept between two HUD refreshes (the refresh runs at 4 Hz); a backstop only. */
const EVENT_BUFFER = 600;

export interface Act1Host {
  readonly view: GameView;
  readonly adapters: ClientAdapters;
  readonly hud: Hud;
  /** the app root: the card popup mounts here and the glow finds HUD and window elements */
  readonly root: HTMLElement;
  readonly tracker: TrackerState;
  sync(): Readonly<SyncSettings>;
  updateSync(patch: SyncPatch): boolean;
  queue(cmds: Commands | null | undefined): void;
  isOpen(id: WindowId): boolean;
  inScene(): boolean;
  talking(): boolean;
  selection(): string | null;
  /** nothing blocks a save right now */
  canSave(): boolean;
  /** the prologue's eavesdrop tier the story layer plays now (P5), null outside it */
  listenTier(): string | null;
  notify(n: NotifySpec): void;
  /** the page's key-value storage (the cross-save muted categories) */
  kv: KeyValueStore | null;
}

export class Act1Wiring {
  readonly tutorial: TutorialSession;
  readonly notes = new EvidenceNotes();
  private readonly avail: AvailabilityFlags;
  private readonly offer: OfferPop;
  private readonly padUnlock = new PadAudioUnlock();
  private pending: AnyWorldEvent[] = [];
  private receipts: OfferReceipt[] = [];
  private coinAt: number | null = null;
  private tideDismissed: string | null = null;
  private open = new Set<WindowId>();
  private guidanceSeen: GuidanceLevel;
  private readonly story = new StorySignals();

  constructor(private readonly h: Act1Host) {
    this.avail = new AvailabilityFlags(h.view, h.adapters);
    this.guidanceSeen = h.sync().gameplay.guidance;
    this.tutorial = new TutorialSession({
      root: h.root,
      bar: h.hud.hint,
      notify: (_text, stepId) =>
        h.notify({ level: 'important', text: { key: `${keyBase(stepId)}.notify` } }),
      kv: h.kv,
      guidance: this.guidanceSeen,
    });
    this.offer = new OfferPop({
      model: () => this.offerInput(),
      offer: (itemId, want) => h.queue(h.adapters.goddess?.offer(h.view, itemId, want)),
      close: () => this.offer.setOpen(false),
    });
    h.hud.root.append(this.offer.el);
  }

  /** The flags window availability reads: the world's plus the act-1 discovery keys. */
  availFlags(): ReturnType<AvailabilityFlags['current']> {
    return this.avail.current();
  }

  /** The help window's cards and glossary (17.7). */
  help(): HelpSource {
    return this.tutorial.helpSource(() => this.h.view.flags());
  }

  /** The kernel's events of a step. */
  events(evs: readonly AnyWorldEvent[], now: number): void {
    for (const ev of evs) {
      if (coinUsedByEvent(ev)) this.coinAt = now;
      const r = offerReceipt(ev);
      if (r) this.receipts = pushReceipt(this.receipts, r);
    }
    // only the kinds the catalogue reads, so a busy fight never pushes a one-shot trigger out
    for (const ev of evs) if (TUT_EVENT_KINDS.has(ev.kind)) this.pending.push(ev);
    if (this.pending.length > EVENT_BUFFER)
      this.pending.splice(0, this.pending.length - EVENT_BUFFER);
  }

  /** The hint bar's context while an onboarding bar waits in a scene (the quarrel, the fall). */
  hintContext(base: HintContext): HintContext {
    return this.tutorial.hintContext({ ...base, guidance: this.tutorial.guidance });
  }

  /** A modal guidance card holds the world (17.2). */
  holdsWorld(): boolean {
    return this.tutorial.holdsWorld();
  }

  openOffer(): void {
    this.offer.setOpen(true);
    this.offer.update();
  }

  closeTide(night: string): void {
    this.tideDismissed = night;
  }

  /** The first gamepad press starts the audio output (18.5: a pad-only player hears it too). */
  padUnlocks(): boolean {
    return this.padUnlock.press(readGamepad(), false);
  }

  /** The HUD refresh (4 Hz, or forced). */
  refresh(now: number): void {
    const { view: v, adapters: a, hud } = this.h;
    const sync = this.h.sync();
    // the gameplay page changed the guidance level: it applies to this run (and its save)
    if (sync.gameplay.guidance !== this.guidanceSeen) {
      this.guidanceSeen = sync.gameplay.guidance;
      this.tutorial.setGuidance(this.guidanceSeen);
    }
    const dianKnown = flagOn(v.flag(DIAN_KNOWN_FLAG));
    const field = a.dungeon?.field(v) ?? null;
    // the left-item line shows only when something lies in this dungeon
    const left = field ? leftItemsIn(field, a.dungeon?.dungeons(v) ?? []) : 0;
    hud.dungeonBar.update(dungeonBarModel(field, dianKnown, left));
    const tide = a.tide?.tide(v) ?? null;
    hud.tide.update(
      tidePanelModel({
        data: tide,
        onMap: !!tide && v.player()?.mapId === tide.mapId,
        dianKnown,
        dismissed: this.tideDismissed,
      }),
    );
    const reduceFlashing = this.reduceFlashing();
    hud.coin.update(
      coinBadgeModel({
        now,
        usedAt: this.coinAt,
        holdsCoin: a.goddess?.canOffer(v) ?? false,
        reduceFlashing,
      }),
    );
    if (this.offer.isOpen) this.offer.update();
    this.tutorialFrame(now, reduceFlashing);
  }

  private reduceFlashing(): boolean {
    const f = this.h.sync().accessibility.reduceFlashing;
    if (f === 'on') return true;
    if (f === 'off') return false;
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private tutorialFrame(now: number, reduceFlashing: boolean): void {
    const { view: v, adapters: a } = this.h;
    const open = new Set<WindowId>(WINDOW_DEFS.map((d) => d.id).filter((id) => this.h.isOpen(id)));
    const fresh = newlyOpened(this.open, open);
    this.open = open;
    for (const id of fresh.opened) this.tutorial.onWindowOpened(id as TutWindow);
    if (fresh.menu) this.tutorial.signal('menu_opened');
    const pid = v.playerId();
    const me = unitOf(v.world as never, pid);
    const fighting = !!me && me.combatUntil > v.tick;
    const hp = a.unitFrames?.unitFrame(v, pid, pid)?.hp;
    const sel = this.h.selection();
    const hostileNear = !!a.combat?.nextEnemy(v, null);
    const act = v.flag('act');
    const held = this.h.inScene() || this.h.talking();
    const p = v.player();
    const signals = levelSignals({
      talkableNear: !!a.interact?.nearestTalkable(v),
      talking: this.h.talking(),
      hostileNear,
      hostileTarget: !!sel && !!a.combat?.isHostile(v, sel),
      fighting,
      hpShare: hp && hp.max > 0 ? hp.value / hp.max : null,
      boardNear: !!a.board?.boardHere(v),
      nodeNear: (a.gather?.nodes(v).length ?? 0) > 0,
      stationNear: (a.craft?.stations(v).length ?? 0) > 0,
      act: typeof act === 'string' ? act : '',
      hour: v.calendar().hour,
      canSave: this.h.canSave(),
      padConnected: readGamepad() !== null,
    });
    for (const s of this.storySignals(typeof act === 'string' ? act : '')) signals.add(s);
    const events = this.pending;
    this.pending = [];
    this.tutorial.frame(now, {
      act: typeof act === 'string' ? act : '',
      playerId: pid,
      // evidence and wearable gains (tut_a1_evidence, tut_a1_equip)
      item: (id) => {
        const d = v.itemDef(id);
        return d ? { kind: d.kind, equippable: !!d.slot } : undefined;
      },
      flags: v.flags(),
      newEvents: events,
      signals,
      openWindows: open as ReadonlySet<TutWindow>,
      combat: fighting,
      held,
      danger: hostileNear,
      pos: p ? { x: p.x, y: p.y, mapId: p.mapId } : null,
      reduceFlashing,
    });
  }

  /** The story signals: the prologue's prompts, the fall, key choices, evidence, shop, deadlines. */
  private storySignals(act: string) {
    const { view: v, adapters: a } = this.h;
    const sv = a.scene?.scene(v) ?? null;
    const log = a.quests?.log(v);
    const deadline =
      !!log &&
      !!a.questDetail &&
      log.active.some((q) => (a.questDetail?.detail(v, q.id)?.expiryWeek ?? null) !== null);
    return this.story.update({
      act,
      waiting: sv?.waiting ?? null,
      keyed: !!sv?.choices.some((c) => !!c.key),
      keyChoice: !!sv?.choices.some((c) => !!c.confirm),
      listen: this.h.listenTier(),
      shop: !!a.trade?.session(v),
      deadline,
    });
  }

  private offerInput() {
    const { view: v, adapters: a } = this.h;
    const coinItem = goddessByRole(v.content as never, 'offering')?.token ?? null;
    const holding = v.holding(v.playerId());
    // only what she may take: never keys, evidence, books, her coin or the last worn copy
    const items = offerableItems(holding.items, (id) => v.itemDef(id), coinItem, holding.equipped);
    const ledger = v.flag('merca_ledger');
    return {
      holdsCoin: a.goddess?.canOffer(v) ?? false,
      coinItem,
      items,
      ledger: typeof ledger === 'number' ? ledger : null,
      receipts: this.receipts,
    };
  }

  /** The save's client segment (17.8): guidance and steps, tracking, evidence notes. */
  segment(): ClientSegment | null {
    return buildClientSegment({
      tutorial: this.tutorial.snapshot(),
      tracker: this.h.tracker.snapshot(),
      notes: this.notes.snapshot(),
      unlocks: this.avail.snapshot(),
    });
  }

  /** Restore a loaded save's client segment; the run's guidance level becomes the setting. */
  restore(raw: unknown): void {
    const seg = parseClientSegment(raw);
    if (!seg) return;
    if (seg.tutorial !== undefined && this.tutorial.restore(seg.tutorial)) {
      // the run's own level becomes the setting the gameplay page shows, but only when the save
      // carries a valid one (a snapshot without it must not reset the player's choice)
      const saved = (seg.tutorial as { guidance?: unknown }).guidance;
      const g = this.h.sync().gameplay;
      if ((GUIDANCE_LEVELS as readonly unknown[]).includes(saved)) {
        const level = saved as GuidanceLevel;
        this.guidanceSeen = level;
        if (g.guidance !== level) this.h.updateSync({ gameplay: { ...g, guidance: level } });
      } else {
        this.tutorial.setGuidance(g.guidance);
      }
    }
    this.avail.restore(seg.unlocks);
    if (seg.tracker !== undefined) this.h.tracker.restore(seg.tracker);
    this.notes.restore(seg.notes);
  }

  dispose(): void {
    this.tutorial.dispose();
    this.offer.el.remove();
  }
}

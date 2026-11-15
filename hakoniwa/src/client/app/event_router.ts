// Routes world events to client presentation: message log lines (core formatter plus the
// system log adapters), speech bubbles, loose lines for the conversation box, animation
// cues, floating combat text, banners, and "something changed" signals for the map,
// window availability, conversations, scenes, battles and trade.

import type { AnyWorldEvent } from '../../core/contracts';
import type { DialogueQueue } from '../hud/dialogue_queue';
import { formatEvent, type LogContext, type LogLine } from '../hud/log_format';
import type { AnimTracker } from '../render/anim_state';
import type { BubbleBoard } from '../render/bubbles';
import type { FloatingBoard } from '../render/floating_text';
import type { BannerView, ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';
import type { WindowId } from '../windows/window_registry';

export interface EventSinks {
  log(line: LogLine): void;
  banner(b: BannerView): void;
  /** a conversation, scene or loose line changed: re-render those now */
  storyChanged(): void;
  playerMapChanged(): void;
  featuresChanged(): void;
  openWindow(id: WindowId): void;
  closeWindow(id: WindowId): void;
}

export class EventRouter {
  constructor(
    private readonly view: GameView,
    private readonly adapters: ClientAdapters,
    private readonly bubbles: BubbleBoard,
    private readonly loose: DialogueQueue,
    private readonly anim: AnimTracker,
    private readonly floats: FloatingBoard,
    private readonly sinks: EventSinks,
  ) {}

  private logContext(): LogContext {
    const v = this.view;
    const p = v.player();
    return {
      playerId: v.playerId(),
      playerMapId: p?.mapId ?? '',
      itemName: (id) => v.itemDef(id)?.name,
      mapName: (id) => v.map(id)?.name,
      entityName: (id) => v.entity(id)?.name,
    };
  }

  handle(events: readonly AnyWorldEvent[], nowMs: number): void {
    const ctx = this.logContext();
    const a = this.adapters;
    const v = this.view;
    let story = false;
    const inScene = () => !!a.scene?.scene(v);
    for (const ev of events) {
      // Scene lines live in the scene panel; the log keeps everything else.
      const line = ev.kind === 'dialogue.line' && inScene() ? null : formatEvent(ev, ctx);
      if (line) this.sinks.log(line);
      for (const la of a.log ?? []) {
        const extra = la.format(v, ev);
        if (extra) this.sinks.log(extra);
      }
      const banner = a.banner?.banner(v, ev);
      if (banner) this.sinks.banner(banner);
      if (a.combat) {
        for (const cue of a.combat.animationCues(v, ev))
          this.anim.cue(cue.entityId, cue.anim, nowMs);
        for (const f of a.combat.floatingText(v, ev))
          this.floats.add(f.entityId, f.text, f.kind, nowMs);
      }
      switch (ev.kind) {
        case 'dialogue.line': {
          const d = ev.data;
          this.bubbles.add(d.speakerId, d.text, d.kind, nowMs);
          if (inScene()) break;
          const conv = a.conversation?.conversation(v);
          if (conv && (d.speakerId === conv.npcId || d.speakerId === ctx.playerId)) break;
          if (this.loose.push(d, ctx.playerId)) story = true;
          break;
        }
        case 'dialogue.opened':
        case 'dialogue.closed':
        case 'scene.started':
        case 'scene.ended':
        case 'scene.choice':
          story = true;
          break;
        case 'world.map_changed':
          if (ev.data.id === ctx.playerId) this.sinks.playerMapChanged();
          break;
        case 'flag.changed':
          if (ev.data.key.startsWith('feature.')) this.sinks.featuresChanged();
          break;
        case 'feature.unlocked':
          this.sinks.featuresChanged();
          break;
        case 'war.battle_started':
          this.sinks.openWindow('battle');
          break;
        case 'economy.trade_opened':
          this.sinks.openWindow('trade');
          break;
        case 'economy.trade_closed':
          this.sinks.closeWindow('trade');
          break;
        default:
          break;
      }
    }
    if (story) this.sinks.storyChanged();
  }
}

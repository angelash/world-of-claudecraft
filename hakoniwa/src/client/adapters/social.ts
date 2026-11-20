// Social and story adapters: interaction, the conversation box, scenes, trade, overhead
// quest markers, the quest log, rumors and reputation, the party, the Thousand Doors and
// the goddesses. Pure functions of GameView plus each system's exported queries.

import type { SystemContext } from '../../core/system';
import { t } from '../../shared_ui/i18n';
import { type Reputation, reputationOf, rumorBook } from '../../systems/cognition';
import { isHostile, unitOf } from '../../systems/combat';
import { canTalkTo, currentConversation, TALK_RANGE } from '../../systems/dialogue';
import { corridorView } from '../../systems/doors';
import { tradeSessionView } from '../../systems/economy';
import { divineRecord, goddessView, revelationsShown } from '../../systems/goddess';
import { countItem } from '../../systems/inventory';
import { partyView } from '../../systems/party';
import { offerable, questDef, questLog } from '../../systems/quests';
import { interactPoint, roamPoints, sceneView } from '../../systems/scenes';
import type { MarkerKind } from '../render/markers';
import type {
  ConversationAdapter,
  DoorsAdapter,
  GoddessAdapter,
  InteractAdapter,
  MapMarkerAdapter,
  MapMarkerView,
  OverheadAdapter,
  PartyAdapter,
  QuestsAdapter,
  RumorsAdapter,
  SceneAdapter,
  TradeAdapter,
} from '../view/adapters';
import type { GameView } from '../view/game_view';

export const SAY_MAX = 200;

/** A text value a model wrote: raw text with its language (D-087). */
export function isModelText(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { raw?: unknown }).raw === 'string' &&
    typeof (v as { lang?: unknown }).lang === 'string'
  );
}

export function createInteractAdapter(): InteractAdapter {
  const talkable = (view: GameView, id: string) => canTalkTo(view.world as never, id);
  return {
    interact(view, targetId) {
      if (!targetId) {
        // a roam node's touch point in reach (onboarding_interaction.md 5.3) comes first
        const point = interactPoint(roamPoints(view.world as never, view.content as never));
        if (point) return [{ kind: 'scenes.choose', data: { choiceId: point.id } }];
        const near = this.nearestTalkable(view);
        return near ? [{ kind: 'dialogue.talk', data: { npcId: near } }] : null;
      }
      if (talkable(view, targetId)) return [{ kind: 'dialogue.talk', data: { npcId: targetId } }];
      const w = view.world as never;
      if (unitOf(w, targetId) && isHostile(w, view.playerId(), targetId)) {
        return [{ kind: 'combat.attack', data: { on: true, targetId } }];
      }
      return null;
    },
    prompt(view, entityId) {
      return talkable(view, entityId) ? t('ui.hud.prompt.talk') : null;
    },
    nearestTalkable(view) {
      const p = view.player();
      if (!p) return null;
      let best: string | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const e of view.entitiesOnMap(p.mapId)) {
        if (e.kind !== 'npc') continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= TALK_RANGE && d < bestD && talkable(view, e.id)) {
          best = e.id;
          bestD = d;
        }
      }
      return best;
    },
  };
}

export function createConversationAdapter(): ConversationAdapter {
  return {
    maxSay: SAY_MAX,
    conversation(view) {
      const c = currentConversation(view.world as never);
      if (!c) return null;
      return {
        npcId: c.npcId,
        name: c.name,
        lines: c.lines.map((l) => ({
          speakerId: l.speakerId,
          speakerName: t(l.speakerName),
          text: t(l.text),
          kind: l.kind,
          // model words are kept as raw text (D-087); only the model writes raw NPC lines
          generated: isModelText(l.text) && l.speakerId !== view.playerId(),
        })),
        options: c.options.map((o) => ({
          id: o.id,
          label: t(o.label),
          hint: o.hint === undefined ? undefined : t(o.hint),
          system: o.system,
        })),
        pending: c.pending,
      };
    },
    choose: (_view, optionId) => [{ kind: 'dialogue.choose', data: { optionId } }],
    say(_view, text) {
      const t = text.trim().slice(0, SAY_MAX);
      return t ? [{ kind: 'dialogue.say', data: { text: t } }] : [];
    },
    close: () => [{ kind: 'dialogue.close', data: {} }],
  };
}

export function createSceneAdapter(): SceneAdapter {
  return {
    // a roam node hands the player back control: no panel, the touch points come from roam()
    scene: (view) => {
      const v = sceneView(view.world as never, view.content as never);
      return v && v.waiting !== 'roam' ? v : null;
    },
    roam: (view) => roamPoints(view.world as never, view.content as never),
    roamScene: (view) => {
      const v = sceneView(view.world as never, view.content as never);
      return v?.waiting === 'roam' ? v : null;
    },
    advance: () => [{ kind: 'scenes.advance', data: {} }],
    choose: (_view, choiceId) => [{ kind: 'scenes.choose', data: { choiceId } }],
    input(_view, text) {
      const t = text.trim();
      return t ? [{ kind: 'scenes.input', data: { text: t } }] : [];
    },
  };
}

export function createTradeAdapter(): TradeAdapter {
  return {
    session: (view) => tradeSessionView(view.world as never, view.content as never),
    buy: (_view, itemId, qty) => [{ kind: 'economy.buy', data: { itemId, qty } }],
    sell: (_view, itemId, qty) => [{ kind: 'economy.sell', data: { itemId, qty } }],
    close: () => [{ kind: 'economy.close_trade', data: {} }],
  };
}

/** A read-only stand-in for the SystemContext the quest queries take. */
function readCtx(view: GameView): SystemContext {
  return {
    world: view.world,
    content: view.content,
    tick: view.tick,
    flag: (k: string) => view.flags()[k],
  } as unknown as SystemContext;
}

/**
 * Quest markers per persona id: a quest to offer, or one ready to hand in. Recomputed at
 * most once per world tick.
 */
export function questMarkers(view: GameView): Map<string, MarkerKind> {
  const out = new Map<string, MarkerKind>();
  const slice = (
    view.world.slices as {
      quests?: { quests: Record<string, { status: string }>; order: string[] };
    }
  ).quests;
  if (!slice) return out;
  const ctx = readCtx(view);
  for (const def of view.content.quests ?? []) {
    if (def.giver && !slice.quests[def.id] && !out.has(def.giver)) {
      if (offerable(ctx, def.giver).length > 0) out.set(def.giver, 'quest');
    }
  }
  for (const id of slice.order) {
    if (slice.quests[id]?.status !== 'ready') continue;
    const def = questDef(view.content as never, id);
    if (def?.turnIn) out.set(def.turnIn, 'turn_in');
  }
  return out;
}

export function createQuestMarkerAdapters(): {
  overhead: OverheadAdapter;
  mapMarkers: MapMarkerAdapter;
} {
  let tick = -1;
  let cache = new Map<string, MarkerKind>();
  const markersByPersona = (view: GameView) => {
    if (view.tick !== tick) {
      tick = view.tick;
      cache = questMarkers(view);
    }
    return cache;
  };
  return {
    overhead: {
      markers(view, entityId) {
        const e = view.entity(entityId);
        if (!e?.ref || e.kind !== 'npc') return [];
        const m = markersByPersona(view).get(e.ref);
        return m ? [m] : [];
      },
    },
    mapMarkers: {
      markers(view, mapId) {
        const m = markersByPersona(view);
        const out: MapMarkerView[] = [];
        for (const e of view.entitiesOnMap(mapId)) {
          const k = e.ref && e.kind === 'npc' ? m.get(e.ref) : undefined;
          if (k === 'quest' || k === 'turn_in')
            out.push({ x: e.x, y: e.y, kind: k, label: e.name });
        }
        return out;
      },
    },
  };
}

export function createQuestsAdapter(): QuestsAdapter {
  return {
    log: (view) => questLog(view.world as never, view.content as never),
    choose: (_view, questId, optionId) => [{ kind: 'quests.choose', data: { questId, optionId } }],
  };
}

export function createRumorsAdapter(): RumorsAdapter {
  return {
    rumors: (view) =>
      rumorBook(view.world as never, view.content as never).map((r) => ({
        ...r,
        text: t(r.text),
        fromName: t(r.fromName),
        credibility: t(r.credibility),
      })),
    reputation: (view) => {
      const rep = reputationOf(view.world as never, view.content as never);
      const line = (r: Reputation) => ({
        ...r,
        name: t(r.name),
        fameBand: t(r.fameBand),
        opinionBand: t(r.opinionBand),
        estimate: t(r.estimate),
        label: t(r.label),
        mainstream: r.mainstream.map((s) => t(s)),
      });
      return { regions: rep.regions.map(line), factions: rep.factions.map(line) };
    },
  };
}

export function createPartyAdapter(): PartyAdapter {
  return {
    companions: (view) => partyView(view.world as never, view.content as never),
    order: (_view, companionId, order) => [{ kind: 'party.order', data: { companionId, order } }],
  };
}

export function createDoorsAdapter(): DoorsAdapter {
  return {
    doors: (view) =>
      corridorView(view.world as never, view.content as never).map((d) => ({
        ...d,
        categoryName: t(d.categoryName),
        stateName: t(d.stateName),
      })),
    open: (_view, doorId) => [{ kind: 'doors.open', data: { doorId } }],
    close: (_view, doorId) => [{ kind: 'doors.close', data: { doorId } }],
  };
}

export function createGoddessAdapter(): GoddessAdapter {
  return {
    goddesses: (view) =>
      goddessView(view.world as never, view.content as never).map((g) => ({
        ...g,
        gazeBand: t(g.gazeBand),
        relationBand: t(g.relationBand),
        knownActions: g.knownActions.map((a) => ({ ...a, note: t(a.note) })),
      })),
    record: (view) => divineRecord(view.world as never).map((e) => ({ ...e, note: t(e.note) })),
    revelations: (view) => revelationsShown(view.world as never),
    canOffer: (view) => countItem(view.world as never, view.playerId(), 'merca_coin') > 0,
    offer: (_view, itemId, want) => [{ kind: 'goddess.offer', data: { itemId, want } }],
  };
}

/** Short label for a quest objective with progress, e.g. "击败澱渣 3/5". */
export function objectiveText(o: {
  label: string;
  progress: number;
  need: number;
  done: boolean;
}): string {
  if (o.need > 1)
    return t('ui.win.quests.progress', {
      label: o.label,
      cur: Math.min(o.progress, o.need),
      need: o.need,
    });
  return o.label;
}

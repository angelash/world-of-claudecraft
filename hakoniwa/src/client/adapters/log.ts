// Message-log lines and full-screen banners for system-owned events (combat, quests,
// doors, party, cognition, economy, city, warfare, strategy, the goddesses). Pure.

import type { AnyWorldEvent } from '../../core/contracts';
import { fmt, T } from '../../shared_ui/text';
import type { BannerAdapter, BannerView, LogAdapter } from '../view/adapters';
import type { GameView } from '../view/game_view';

type Line = { text: string; category: string } | null;

function nameOf(view: GameView, id: string): string {
  return view.entity(id)?.name ?? T.log.someone;
}

function doorName(view: GameView, doorId: string): string {
  return view.content.doors?.find((d) => d.id === doorId)?.name ?? doorId;
}

function nationName(view: GameView, id: string | null): string {
  if (!id) return T.log.someone;
  if (id === 'player') return T.logx.yourNation;
  return view.content.slg_nations?.find((n) => n.id === id)?.name ?? id;
}

function scenarioName(view: GameView, id: string): string {
  return view.content.battle_scenarios?.find((s) => s.id === id)?.name ?? id;
}

export function formatSystemEvent(view: GameView, ev: AnyWorldEvent): Line {
  const me = view.playerId();
  const L = T.logx;
  switch (ev.kind) {
    case 'combat.xp':
      return ev.data.entityId === me && ev.data.amount > 0
        ? { text: fmt(L.xp, { n: ev.data.amount }), category: 'system' }
        : null;
    case 'combat.player_returned':
      return {
        text: fmt(ev.data.innerCourt ? L.returnedCourt : L.returned, {
          map: view.map(ev.data.toMap)?.name ?? T.log.unknownMap,
        }),
        category: 'warning',
      };
    case 'combat.boss_phase':
      return {
        text: fmt(L.bossPhase, { name: nameOf(view, ev.data.entityId), phase: ev.data.name }),
        category: 'combat',
      };
    case 'combat.boss_defeated':
      return {
        text: fmt(ev.data.yielded ? L.bossYielded : L.bossDefeated, {
          name: nameOf(view, ev.data.entityId),
        }),
        category: 'story',
      };
    case 'combat.wave_spawned':
      return ev.data.mapId === view.player()?.mapId ? { text: L.wave, category: 'warning' } : null;
    case 'combat.wave_cleared':
      return ev.data.mapId === view.player()?.mapId
        ? { text: L.waveCleared, category: 'story' }
        : null;
    case 'combat.presence_felt':
      return ev.data.entityId === me
        ? { text: fmt(L.presence, { name: nameOf(view, ev.data.sourceId) }), category: 'warning' }
        : null;
    case 'combat.revived':
      return ev.data.entityId === me ? { text: L.revived, category: 'system' } : null;
    case 'quest.started':
      return { text: fmt(L.questStarted, { title: ev.data.title }), category: 'story' };
    case 'quest.stage':
      return ev.data.desc
        ? { text: fmt(L.questStage, { desc: ev.data.desc }), category: 'story' }
        : null;
    case 'quest.ready': {
      const turnIn = ev.data.turnIn;
      const who = view.content.npcs?.find((p) => p.id === turnIn)?.name ?? turnIn;
      const title =
        view.content.quests?.find((q) => q.id === ev.data.questId)?.title ?? ev.data.questId;
      return { text: fmt(L.questReady, { title, who }), category: 'story' };
    }
    case 'quest.completed':
      return { text: fmt(L.questDone, { title: ev.data.title }), category: 'story' };
    case 'doors.state':
      if (ev.data.to === 'openable')
        return {
          text: fmt(L.doorOpenable, { name: doorName(view, ev.data.doorId) }),
          category: 'story',
        };
      if (ev.data.to === 'hinted') return { text: L.doorHinted, category: 'story' };
      return null;
    case 'party.joined':
      return { text: fmt(L.joined, { name: nameOf(view, ev.data.entityId) }), category: 'story' };
    case 'party.left': {
      const name = view.content.companions?.find((c) => c.id === ev.data.companionId)?.name;
      return { text: fmt(L.left, { name: name ?? ev.data.companionId }), category: 'story' };
    }
    case 'cognition.appraised':
      return ev.data.observerId === me
        ? {
            text: fmt(L.appraised, {
              name: nameOf(view, ev.data.targetId),
              display: ev.data.display,
              note: ev.data.note,
            }),
            category: 'system',
          }
        : null;
    case 'cognition.rumor_heard':
      return { text: fmt(L.rumorHeard, { text: ev.data.text }), category: 'world' };
    case 'economy.company_founded':
      return { text: L.companyFounded, category: 'story' };
    case 'economy.caravan_arrived':
      return { text: L.caravanArrived, category: 'loot' };
    case 'economy.caravan_raided':
      return { text: L.caravanRaided, category: 'warning' };
    case 'city.building_placed':
      return ev.data.by === 'player' ? { text: L.buildingPlaced, category: 'system' } : null;
    case 'city.stage_changed':
      return { text: L.stageChanged, category: 'story' };
    case 'city.event':
      return { text: ev.data.text, category: ev.data.severity === 'severe' ? 'warning' : 'world' };
    case 'war.battle_started':
      return {
        text: fmt(L.battleStarted, { name: scenarioName(view, ev.data.scenario) }),
        category: 'story',
      };
    case 'war.battle_report':
      return {
        text: fmt(L.battleReport, {
          name: scenarioName(view, ev.data.scenario),
          result:
            ev.data.victor === 'player'
              ? L.victory
              : ev.data.victor === 'enemy'
                ? L.defeat
                : L.draw,
        }),
        category: 'story',
      };
    case 'slg.war_declared':
      return {
        text: fmt(L.warDeclared, {
          a: nationName(view, ev.data.attacker),
          b: nationName(view, ev.data.defender),
        }),
        category: 'warning',
      };
    case 'slg.peace':
      return {
        text: fmt(L.peace, { a: nationName(view, ev.data.a), b: nationName(view, ev.data.b) }),
        category: 'world',
      };
    case 'slg.nation_founded':
      return { text: fmt(L.nationFounded, { name: ev.data.name }), category: 'story' };
    case 'goddess.revelation':
      return { text: ev.data.text, category: 'divine' };
    default:
      return null;
  }
}

export function bannerFor(view: GameView, ev: AnyWorldEvent): BannerView | null {
  switch (ev.kind) {
    case 'goddess.revelation':
      return { kind: 'maker', title: T.banner.revelation, text: ev.data.text };
    case 'act.changed': {
      const act = view.content.acts?.find((a) => a.id === ev.data.to);
      return act ? { kind: 'act', title: act.title ?? ev.data.to, text: '' } : null;
    }
    case 'door.opened':
      return { kind: 'door', title: T.banner.doorOpened, text: doorName(view, ev.data.doorId) };
    case 'war.battle_report':
      return {
        kind: 'battle',
        title:
          ev.data.victor === 'player'
            ? T.logx.victory
            : ev.data.victor === 'enemy'
              ? T.logx.defeat
              : T.logx.draw,
        text: scenarioName(view, ev.data.scenario),
      };
    default:
      return null;
  }
}

export function createLogAdapter(): LogAdapter {
  return { format: formatSystemEvent };
}

export function createBannerAdapter(): BannerAdapter {
  return { banner: bannerFor };
}

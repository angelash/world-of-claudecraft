// Message-log lines and full-screen banners for system-owned events (combat, quests,
// doors, party, cognition, economy, city, warfare, strategy, the goddesses). Pure.

import type { AnyWorldEvent } from '../../core/contracts';
import { t } from '../../shared_ui/i18n';
import type { BannerAdapter, BannerView, LogAdapter } from '../view/adapters';
import { contentNames } from '../view/content_names';
import type { GameView } from '../view/game_view';

type Line = { text: string; category: string } | null;

function nameOf(view: GameView, id: string): string {
  return view.entity(id)?.name ?? t('ui.hud.log.someone');
}

function doorName(view: GameView, doorId: string): string {
  return view.content.doors?.find((d) => d.id === doorId)?.name ?? doorId;
}

function nationName(view: GameView, id: string | null): string {
  if (!id) return t('ui.hud.log.someone');
  if (id === 'player') return t('ui.hud.log.your_nation');
  return view.content.slg_nations?.find((n) => n.id === id)?.name ?? id;
}

function scenarioName(view: GameView, id: string): string {
  return view.content.battle_scenarios?.find((s) => s.id === id)?.name ?? id;
}

export function formatSystemEvent(view: GameView, ev: AnyWorldEvent): Line {
  const me = view.playerId();

  switch (ev.kind) {
    case 'combat.xp':
      return ev.data.entityId === me && ev.data.amount > 0
        ? { text: t('ui.hud.log.xp', { n: ev.data.amount }), category: 'system' }
        : null;
    case 'combat.player_returned':
      return {
        text: t(ev.data.innerCourt ? 'ui.hud.log.returned_court' : 'ui.hud.log.returned', {
          map: contentNames.map(view.map(ev.data.toMap)) || t('ui.hud.log.unknown_map'),
        }),
        category: 'warning',
      };
    case 'combat.boss_phase':
      return {
        text: t('ui.hud.log.boss_phase', {
          name: nameOf(view, ev.data.entityId),
          phase: ev.data.name,
        }),
        category: 'combat',
      };
    case 'combat.boss_defeated':
      return {
        text: t(ev.data.yielded ? 'ui.hud.log.boss_yielded' : 'ui.hud.log.boss_defeated', {
          name: nameOf(view, ev.data.entityId),
        }),
        category: 'story',
      };
    case 'combat.wave_spawned':
      return ev.data.mapId === view.player()?.mapId
        ? { text: t('ui.hud.log.wave'), category: 'warning' }
        : null;
    case 'combat.wave_cleared':
      return ev.data.mapId === view.player()?.mapId
        ? { text: t('ui.hud.log.wave_cleared'), category: 'story' }
        : null;
    case 'combat.presence_felt':
      return ev.data.entityId === me
        ? {
            text: t('ui.hud.log.presence', { name: nameOf(view, ev.data.sourceId) }),
            category: 'warning',
          }
        : null;
    case 'combat.revived':
      return ev.data.entityId === me ? { text: t('ui.hud.log.revived'), category: 'system' } : null;
    case 'quest.started':
      return { text: t('ui.hud.log.quest_started', { title: ev.data.title }), category: 'story' };
    case 'quest.stage':
      return ev.data.desc
        ? { text: t('ui.hud.log.quest_stage', { desc: ev.data.desc }), category: 'story' }
        : null;
    case 'quest.ready': {
      const turnIn = ev.data.turnIn;
      const who = view.content.npcs?.find((p) => p.id === turnIn)?.name ?? turnIn;
      const title =
        view.content.quests?.find((q) => q.id === ev.data.questId)?.title ?? ev.data.questId;
      return { text: t('ui.hud.log.quest_ready', { title, who }), category: 'story' };
    }
    case 'quest.completed':
      return { text: t('ui.hud.log.quest_done', { title: ev.data.title }), category: 'story' };
    case 'doors.state':
      if (ev.data.to === 'openable')
        return {
          text: t('ui.hud.log.door_openable', { name: doorName(view, ev.data.doorId) }),
          category: 'story',
        };
      if (ev.data.to === 'hinted') return { text: t('ui.hud.log.door_hinted'), category: 'story' };
      return null;
    case 'party.joined':
      return {
        text: t('ui.hud.log.joined', { name: nameOf(view, ev.data.entityId) }),
        category: 'story',
      };
    case 'party.left': {
      const name = view.content.companions?.find((c) => c.id === ev.data.companionId)?.name;
      return {
        text: t('ui.hud.log.left', { name: name ?? ev.data.companionId }),
        category: 'story',
      };
    }
    case 'cognition.appraised':
      return ev.data.observerId === me
        ? {
            text: t('ui.hud.log.appraised', {
              name: nameOf(view, ev.data.targetId),
              display: t(ev.data.display),
              note: t(ev.data.note),
            }),
            category: 'system',
          }
        : null;
    case 'cognition.rumor_heard':
      return { text: t('ui.hud.log.rumor_heard', { text: t(ev.data.text) }), category: 'world' };
    case 'economy.company_founded':
      return { text: t('ui.hud.log.company_founded'), category: 'story' };
    case 'economy.caravan_arrived':
      return { text: t('ui.hud.log.caravan_arrived'), category: 'loot' };
    case 'economy.caravan_raided':
      return { text: t('ui.hud.log.caravan_raided'), category: 'warning' };
    case 'city.building_placed':
      return ev.data.by === 'player'
        ? { text: t('ui.hud.log.building_placed'), category: 'system' }
        : null;
    case 'city.stage_changed':
      return { text: t('ui.hud.log.stage_changed'), category: 'story' };
    case 'city.event':
      return {
        text: t(ev.data.text),
        category: ev.data.severity === 'severe' ? 'warning' : 'world',
      };
    case 'war.battle_started':
      return {
        text: t('ui.hud.log.battle_started', { name: scenarioName(view, ev.data.scenario) }),
        category: 'story',
      };
    case 'war.battle_report':
      return {
        text: t('ui.hud.log.battle_report', {
          name: scenarioName(view, ev.data.scenario),
          result:
            ev.data.victor === 'player'
              ? t('ui.hud.log.victory')
              : ev.data.victor === 'enemy'
                ? t('ui.hud.log.defeat')
                : t('ui.hud.log.draw'),
        }),
        category: 'story',
      };
    case 'slg.war_declared':
      return {
        text: t('ui.hud.log.war_declared', {
          a: nationName(view, ev.data.attacker),
          b: nationName(view, ev.data.defender),
        }),
        category: 'warning',
      };
    case 'slg.peace':
      return {
        text: t('ui.hud.log.peace', {
          a: nationName(view, ev.data.a),
          b: nationName(view, ev.data.b),
        }),
        category: 'world',
      };
    case 'slg.nation_founded':
      return { text: t('ui.hud.log.nation_founded', { name: ev.data.name }), category: 'story' };
    case 'goddess.revelation':
      return { text: ev.data.text, category: 'divine' };
    default:
      return null;
  }
}

export function bannerFor(view: GameView, ev: AnyWorldEvent): BannerView | null {
  switch (ev.kind) {
    case 'goddess.revelation':
      return { kind: 'maker', title: t('ui.hud.banner.revelation'), text: ev.data.text };
    case 'act.changed': {
      const act = view.content.acts?.find((a) => a.id === ev.data.to);
      return act ? { kind: 'act', title: act.title ?? ev.data.to, text: '' } : null;
    }
    case 'door.opened':
      return {
        kind: 'door',
        title: t('ui.hud.banner.door_opened'),
        text: doorName(view, ev.data.doorId),
      };
    case 'war.battle_report':
      return {
        kind: 'battle',
        title:
          ev.data.victor === 'player'
            ? t('ui.hud.log.victory')
            : ev.data.victor === 'enemy'
              ? t('ui.hud.log.defeat')
              : t('ui.hud.log.draw'),
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

// The client's adapters against the real game: createGame() with every system, driven
// through the prologue scene and into act 1 with the same commands the HUD and windows
// queue, checking the views the client shows. Plus pure checks of the adapter helpers.

import { describe, expect, it } from 'vitest';
import {
  animationCuesFor,
  damageText,
  floatingFor,
  hotbarSlots,
} from '../src/client/adapters/combat';
import { costText, siteSummaries } from '../src/client/adapters/domain';
import { bannerFor, formatSystemEvent } from '../src/client/adapters/log';
import { objectiveText, questMarkers } from '../src/client/adapters/social';
import { createAdapters } from '../src/client/app/adapters_wiring';
import { sceneKey, scenePanelModel } from '../src/client/hud/scene_model';
import { installKeyText } from '../src/client/input/glyphs';
import { FLOAT_MS, FloatingBoard } from '../src/client/render/floating_text';
import { lookFromEntity } from '../src/client/sprites/look';
import type { ClientAdapters } from '../src/client/view/adapters';
import { createGameCommands, createGameView, type GameView } from '../src/client/view/game_view';
import type { AnyWorldEvent, EventKind, EventMap } from '../src/core/contracts';
import type { Engine } from '../src/core/engine';
import { createGame } from '../src/game/create';

// {key:} placeholders render with the default key-mouse bindings (the client installs the
// live resolver; ux_and_onboarding.md 16.6 rule 6)
installKeyText(null);

function ev<K extends EventKind>(kind: K, data: EventMap[K], tick = 10): AnyWorldEvent {
  return { kind, tick, seq: 1, data } as unknown as AnyWorldEvent;
}

interface Run {
  engine: Engine;
  view: GameView;
  a: ClientAdapters;
  queue(cmds: readonly unknown[] | null | undefined): void;
}

function start(seed = 20261115): Run {
  const engine = createGame({ seed });
  const view = createGameView(engine);
  const commands = createGameCommands(engine);
  return {
    engine,
    view,
    a: createAdapters(),
    queue: (cmds) => commands.queueAll((cmds ?? []) as never),
  };
}

/** Play the current scenes the way a player would: first choice, a name, advance. */
function playScenes(r: Run, name: string, maxSteps = 600): string[] {
  const seen: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const sv = r.a.scene?.scene(r.view);
    if (!sv) break;
    const m = scenePanelModel(sv);
    seen.push(`${sv.sceneId}/${sv.nodeId}`);
    if (m.mode === 'input') r.queue(r.a.scene?.input(r.view, name));
    else if (m.mode === 'choice') {
      // a node whose only answers are keyed (the prologue fall's reach-out) has no number 1
      const keyed = m.choices.length === 0 ? m.prompts[0] : undefined;
      const act = keyed
        ? ({ type: 'choose', choiceId: keyed.choiceId } as const)
        : sceneKey(m, { action: 'number', n: 1 });
      expect(act?.type).toBe('choose');
      if (act?.type === 'choose') r.queue(r.a.scene?.choose(r.view, act.choiceId));
    } else if (m.mode === 'advance') r.queue(r.a.scene?.advance(r.view));
    r.engine.step(2);
  }
  return seen;
}

describe('client adapters on the real game', () => {
  it('shows the prologue as a scene with numbered choices and the name input', () => {
    const r = start();
    r.engine.step(3);
    const sv = r.a.scene?.scene(r.view);
    expect(sv?.sceneId).toBe('prologue');
    const m = scenePanelModel(sv as NonNullable<typeof sv>);
    expect(m.mode).toBe('choice');
    expect(m.choices.length).toBeGreaterThan(1);
    expect(m.choices[0]?.number).toBe(1);
    expect(m.lines.some((l) => l.kind === 'narrate')).toBe(true);
    // number keys pick choices, Space does nothing while a choice waits
    expect(sceneKey(m, { action: 'advance' })).toBeNull();
    const pick = sceneKey(m, { action: 'number', n: 2 });
    expect(pick).toEqual({ type: 'choose', choiceId: m.choices[1]?.id });
    r.queue(r.a.scene?.choose(r.view, m.choices[1]?.id ?? ''));
    r.engine.step(2);
    const next = r.a.scene?.scene(r.view);
    expect(next?.nodeId).not.toBe(sv?.nodeId);
    // movement is held during scenes: the player is in the divine court
    expect(r.view.player()?.mapId).toBe('divine_court');
  });

  it('plays through the prologue into act 1 and fills the HUD views', () => {
    const r = start();
    r.engine.step(3);
    const seen = playScenes(r, '测试者');
    expect(seen.some((s) => s.startsWith('prologue/n5_name'))).toBe(true);
    expect(seen.some((s) => s.startsWith('act1_intro'))).toBe(true);
    expect(r.a.scene?.scene(r.view)).toBeNull();
    const pid = r.view.playerId();
    const p = r.view.player();
    expect(p?.mapId).toBe('seal_ruins');
    // the player's name comes from the prologue input
    expect(p?.name).toBe('测试者');

    // unit frame: own level, health, resource, experience
    const frame = r.a.unitFrames?.unitFrame(r.view, pid, pid);
    expect(frame?.level).toBeGreaterThanOrEqual(1);
    expect(frame?.hp?.max).toBeGreaterThan(0);
    expect(frame?.xp?.max).toBeGreaterThan(0);

    // hotbar from the ability bar
    const bar = hotbarSlots(r.view);
    expect(bar.length).toBeGreaterThan(0);
    expect(bar[0]?.slot).toBe(1);
    expect(bar[0]?.abilityId).toBeTruthy();

    // character sheet
    const sheet = r.a.character?.sheet(r.view);
    expect(sheet?.name).toBe('测试者');
    expect(sheet?.abilities.length).toBe(bar.length);

    // quest log: the first main quest of act 1
    const log = r.a.quests?.log(r.view);
    expect(log?.act).toBe('act1');
    expect(log?.active.some((q) => q.id === 'q_a1_m01_fall')).toBe(true);

    // doors, goddesses, rumors, party, company, territory, battle and continent all answer
    expect(Array.isArray(r.a.doors?.doors(r.view))).toBe(true);
    expect(r.a.goddess?.goddesses(r.view).length).toBeGreaterThanOrEqual(5);
    expect(r.a.goddess?.canOffer(r.view)).toBe(true);
    expect(Array.isArray(r.a.rumors?.rumors(r.view))).toBe(true);
    expect(r.a.party?.companions(r.view)).toEqual([]);
    expect(r.a.company?.company(r.view).founded).toBe(false);
    expect(siteSummaries(r.view).length).toBeGreaterThan(0);
    expect(r.a.battle?.battle(r.view)).toBeNull();
    expect(r.a.strategy?.continent(r.view).provinces.length).toBeGreaterThan(0);
  });

  it('targets and fights a monster through the combat adapter', () => {
    const r = start();
    r.engine.step(3);
    playScenes(r, '测试者');
    const pid = r.view.playerId();
    const enemy = r.a.combat?.nextEnemy(r.view, null);
    const p = r.view.player();
    expect(p).toBeTruthy();
    // walk next to the nearest monster on the map
    const monsters = r.view
      .entitiesOnMap(p?.mapId ?? '')
      .filter((e) => e.kind === 'monster' && e.alive)
      .sort(
        (x, y) =>
          Math.hypot(x.x - (p?.x ?? 0), x.y - (p?.y ?? 0)) -
          Math.hypot(y.x - (p?.x ?? 0), y.y - (p?.y ?? 0)),
      );
    const target = monsters[0];
    expect(target).toBeTruthy();
    if (!target) return;
    r.queue([
      {
        kind: 'world.teleport',
        data: { entityId: pid, mapId: target.mapId, x: target.x + 1, y: target.y },
      },
    ]);
    r.engine.step(1);
    expect(r.a.combat?.nextEnemy(r.view, null) ?? enemy).toBeTruthy();
    expect(r.a.combat?.isHostile(r.view, target.id)).toBe(true);
    r.queue(r.a.combat?.selectTarget(r.view, target.id));
    r.queue(r.a.interact?.interact(r.view, target.id));
    const events: AnyWorldEvent[] = [];
    const off = r.engine.onEvents((evs) => events.push(...evs));
    for (let i = 0; i < 400 && target.alive; i++) {
      const res = r.a.combat?.activateSlot(r.view, 1, target.id);
      if (Array.isArray(res)) r.queue(res);
      r.engine.step(5);
    }
    off();
    expect(events.some((e) => e.kind === 'combat.damage')).toBe(true);
    const floats = events.flatMap((e) => r.a.combat?.floatingText(r.view, e) ?? []);
    expect(floats.length).toBeGreaterThan(0);
    const cues = events.flatMap((e) => r.a.combat?.animationCues(r.view, e) ?? []);
    expect(cues.some((c) => c.anim === 'hit')).toBe(true);
    // the target frame reads strength instead of a level
    const tf = r.a.unitFrames?.unitFrame(r.view, target.id, pid);
    expect(tf?.levelText).toBeTruthy();
    expect(tf?.level).toBeUndefined();
  });

  it('talks to a resident in Borderstone through the interact and conversation adapters', () => {
    const r = start();
    r.engine.step(3);
    playScenes(r, '测试者');
    const pid = r.view.playerId();
    const npc = r.view
      .entitiesOnMap('borderstone')
      .find((e) => e.kind === 'npc' && e.alive && !e.hidden && e.ref);
    expect(npc).toBeTruthy();
    if (!npc) return;
    r.queue([
      {
        kind: 'world.teleport',
        data: { entityId: pid, mapId: 'borderstone', x: npc.x + 1, y: npc.y },
      },
    ]);
    r.engine.step(1);
    const near = r.view.entity(npc.id);
    // stand right next to the resident (they may have walked on)
    r.queue([
      {
        kind: 'world.teleport',
        data: { entityId: pid, mapId: 'borderstone', x: (near?.x ?? 0) + 0.8, y: near?.y ?? 0 },
      },
    ]);
    r.engine.step(1);
    const talkable = r.a.interact?.nearestTalkable(r.view);
    expect(talkable).toBeTruthy();
    expect(r.a.interact?.prompt(r.view, talkable ?? '')).toBe('E 交谈');
    r.queue(r.a.interact?.interact(r.view, talkable ?? null));
    r.engine.step(2);
    const conv = r.a.conversation?.conversation(r.view);
    expect(conv?.npcId).toBe(talkable);
    expect(conv?.options.some((o) => o.id === 'bye')).toBe(true);
    expect(conv?.lines.length).toBeGreaterThan(0);
    // the overhead marker cache works on the same tick data
    expect(questMarkers(r.view)).toBeInstanceOf(Map);
    r.queue(r.a.conversation?.say(r.view, '你好'));
    r.engine.step(3);
    expect(r.a.conversation?.conversation(r.view)?.lines.length ?? 0).toBeGreaterThan(
      conv?.lines.length ?? 0,
    );
    r.queue(r.a.conversation?.choose(r.view, 'bye'));
    r.engine.step(2);
    expect(r.a.conversation?.conversation(r.view)).toBeNull();
  });
});

describe('client adapter helpers', () => {
  const view = { playerId: () => 'player', entity: () => undefined } as unknown as GameView;

  it('formats damage, misses and crits for floating text, only for the player side', () => {
    expect(damageText('dodge', 0)).toBe('闪避');
    expect(damageText('absorb', 12)).toBe('吸收 12');
    expect(damageText('hit', 7)).toBe('7');
    const dmg = (
      sourceId: string,
      targetId: string,
      outcome: 'hit' | 'crit' | 'miss',
      amount: number,
    ) =>
      ev('combat.damage', { sourceId, targetId, amount, absorbed: 0, school: 'physical', outcome });
    expect(floatingFor(view, dmg('player', 'm1', 'hit', 12))).toEqual([
      { entityId: 'm1', text: '12', kind: 'damage' },
    ]);
    expect(floatingFor(view, dmg('player', 'm1', 'crit', 30))).toEqual([
      { entityId: 'm1', text: '30 暴击', kind: 'crit' },
    ]);
    expect(floatingFor(view, dmg('m1', 'player', 'hit', 5))[0]?.kind).toBe('damage_taken');
    expect(floatingFor(view, dmg('player', 'm1', 'miss', 0))[0]?.text).toBe('未命中');
    expect(floatingFor(view, dmg('npc', 'm1', 'hit', 9))).toEqual([]);
    expect(
      floatingFor(
        view,
        ev('combat.xp', { entityId: 'player', amount: 40, reason: 'kill', level: 2, xp: 40 }),
      )[0]?.text,
    ).toBe('+40 经验');
  });

  it('cues attack swings and hit reactions', () => {
    expect(
      animationCuesFor(
        ev('combat.damage', {
          sourceId: 'a',
          targetId: 'b',
          amount: 3,
          absorbed: 0,
          school: 'physical',
          outcome: 'hit',
        }),
      ),
    ).toEqual([
      { entityId: 'a', anim: 'attack' },
      { entityId: 'b', anim: 'hit' },
    ]);
    expect(
      animationCuesFor(ev('combat.cast', { casterId: 'a', abilityId: 'x', op: 'finish' })),
    ).toEqual([{ entityId: 'a', anim: 'attack' }]);
    expect(
      animationCuesFor(ev('combat.cast', { casterId: 'a', abilityId: 'x', op: 'start' })),
    ).toEqual([]);
  });

  it('formats system events for the log and picks banners', () => {
    const g = start();
    const v = g.view;
    expect(formatSystemEvent(v, ev('quest.started', { questId: 'q', title: '落门' }))?.text).toBe(
      '新任务：落门',
    );
    expect(
      formatSystemEvent(v, ev('quest.completed', { questId: 'q', title: '落门', kind: 'main' }))
        ?.category,
    ).toBe('story');
    expect(
      formatSystemEvent(
        v,
        ev('combat.xp', { entityId: 'npc_1', amount: 5, reason: 'x', level: 1, xp: 5 }),
      ),
    ).toBeNull();
    expect(formatSystemEvent(v, ev('world.arrived', { id: 'player', x: 1, y: 1 }))).toBeNull();
    expect(
      bannerFor(v, ev('goddess.revelation', { id: 'r1', text: '园子会自己长。', literal: 'X' })),
    ).toEqual({
      kind: 'maker',
      title: '天启',
      text: '园子会自己长。',
    });
    expect(bannerFor(v, ev('act.changed', { from: 'prologue', to: 'act1' }))?.kind).toBe('act');
    expect(bannerFor(v, ev('world.arrived', { id: 'player', x: 1, y: 1 }))).toBeNull();
  });

  it('writes costs and objective progress', () => {
    expect(
      costText(
        { items: { wood: 20, stone: 5 }, money: 300 },
        (id) => ({ wood: '木材', stone: '石料' })[id] ?? id,
      ),
    ).toBe('木材 x20  石料 x5  3 银');
    expect(objectiveText({ label: '击败澱渣', progress: 7, need: 5, done: true })).toBe(
      '击败澱渣 5/5',
    );
    expect(objectiveText({ label: '去遗迹', progress: 0, need: 1, done: false })).toBe('去遗迹');
  });

  it('draws monster beasts as four-legged creatures and resident beasts as beastkin', () => {
    const a = { base: 'beast', colors: [] };
    expect(lookFromEntity({ appearance: a, kind: 'monster' }).archetype).toBe('wolf');
    expect(lookFromEntity({ appearance: a, kind: 'npc' }).archetype).toBe('beastkin');
  });

  it('floats combat text upward, stacks per unit and expires', () => {
    const b = new FloatingBoard();
    b.add('m1', '12', 'damage', 0);
    b.add('m1', '8', 'damage', 0);
    b.add('m2', '升级', 'level', 0);
    const at = b.active(100);
    expect(at).toHaveLength(3);
    const m1 = at.filter((d) => d.entityId === 'm1');
    expect(m1[0]?.rise).not.toBe(m1[1]?.rise);
    expect(at.find((d) => d.kind === 'level')?.scale).toBeGreaterThan(1);
    expect(b.active(FLOAT_MS + 1)).toEqual([]);
  });
});

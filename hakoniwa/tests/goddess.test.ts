import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { GameSystem, SystemContext } from '../src/core/system';
import { tr } from '../src/core/text';
import { tickAtDay } from '../src/core/time';
import { renderTextDeep, t } from '../src/shared_ui/i18n';
import {
  divineRecord,
  type GoddessActCommand,
  goddessContext,
  goddessView,
  honorificsIn,
  planSituation,
} from '../src/systems/goddess';
import { addItem, countItem } from '../src/systems/inventory';
import { activeModifiers } from '../src/systems/modifiers';
import { scanForLeaks } from '../src/systems/quests';
import { spawnEntity } from '../src/systems/world';
import {
  NARRATIVE_SYSTEMS,
  narrativeContent,
  narrativeGame,
  playThrough,
} from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'probe.give': { item: string; count?: number };
    'probe.believer': { tags: string[]; mapId: string };
  }
}

const probe: GameSystem = {
  id: 'zz_goddess_probe',
  order: 999,
  commands: {
    'probe.give'(ctx, d) {
      addItem(ctx, 'player', d.item, d.count ?? 1, 'test');
      return ok();
    },
    'probe.believer'(ctx, d) {
      const p = ctx.world.slices.world.entities.player;
      spawnEntity(ctx, {
        kind: 'npc',
        name: '信徒',
        mapId: d.mapId,
        x: p?.x ?? 1,
        y: p?.y ?? 1,
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', ...d.tags],
      });
      return ok();
    },
  },
};

function game(aiMode: 'off' | 'external' = 'off', act = 'act1'): Engine {
  const g = Engine.create(5, narrativeContent(), [...NARRATIVE_SYSTEMS, probe], { aiMode });
  g.queue('flag.set', { key: 'act', value: act });
  // the act entry writes this marker (data/quests/acts.json)
  if (act !== 'prologue') g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.step(1);
  return g;
}

function act(g: Engine, cmd: Omit<GoddessActCommand, 'revision'> & { revision?: number }) {
  const rev = g.world.slices.goddess.goddesses[cmd.goddessId]?.revision ?? 0;
  g.queue('goddess.act', { revision: rev, ...cmd });
  g.step(1);
  return [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.act');
}

function resetCooldowns(g: Engine, id: string): void {
  const s = g.world.slices.goddess.goddesses[id];
  if (s) s.cooldowns = {};
}

function code(e: ReturnType<typeof act>): string | undefined {
  return e?.kind === 'command.result' ? (e.data.ok ? 'ok' : e.data.code) : undefined;
}

describe('goddess arbiter', () => {
  it('initialises power from the persona cards and gates tools by act', () => {
    const g = game('off', 'prologue');
    expect(g.world.slices.goddess.goddesses.eluen?.power).toBe(2000);
    expect(
      code(act(g, { goddessId: 'eluen', action: 'oracle', params: { text: '守好秩序。' } })),
    ).toBe('inactive');
    const g6 = game('off', 'act6');
    expect(
      code(act(g6, { goddessId: 'eluen', action: 'oracle', params: { text: '守好秩序。' } })),
    ).toBe('inactive');
  });

  it('validates the menu, reach, power, cooldown and texts with readable reasons', () => {
    const g = game();
    expect(code(act(g, { goddessId: 'eluen', action: 'price' }))).toBe('not_on_menu');
    expect(code(act(g, { goddessId: 'valda', action: 'oracle', params: { text: '磨刀。' } }))).toBe(
      'inactive',
    );
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'oracle',
          params: { mapId: 'ash_waste', text: '光。' },
        }),
      ),
    ).toBe('out_of_reach');
    expect(code(act(g, { goddessId: 'eluen', action: 'oracle', params: {} }))).toBe('no_text');
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'oracle',
          params: { text: '守好秩序。', flag: 'act' },
        }),
      ),
    ).toBe('bad_flag');
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'oracle',
          params: { mapId: 'borderstone', text: '守好秩序。' },
        }),
      ),
    ).toBe('ok');
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'oracle',
          params: { mapId: 'borderstone', text: '再说一次。' },
        }),
      ),
    ).toBe('cooldown');
    expect(code(act(g, { goddessId: 'merca', action: 'blessing' }))).toBe('no_token');
    expect(code(act(g, { goddessId: 'eluen', action: 'blessing' }))).toBe('no_token');
    const res = act(g, { goddessId: 'eluen', action: 'price' });
    expect(res?.kind === 'command.result' && res.data.reason).toEqual(
      tr('sys.goddess.reject.not_on_menu'),
    );
  });

  it('drops stale model proposals by revision', () => {
    const g = game('external');
    g.world.inbox.push({
      kind: 'goddess.act',
      data: { goddessId: 'merca', action: 'price', revision: 999, params: { factor: 1.2 } },
      source: { type: 'ai', agentId: 'merca', requestId: 'x' },
    });
    g.step(1);
    const r = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.act');
    expect(code(r)).toBe('stale');
  });

  it('executes interventions as registered modifiers, weather and ledger entries with sediment', () => {
    const g = game('off', 'act3');
    expect(
      code(
        act(g, {
          goddessId: 'sylvie',
          action: 'calamity',
          params: { mapId: 'forest_edge', weather: 'storm' },
        }),
      ),
    ).toBe('ok');
    const mods = activeModifiers(g.world, 'harvest', 'forest_edge');
    expect(mods.some((m) => m.source === 'sylvie' && m.factor === 0.7)).toBe(true);
    expect(activeModifiers(g.world, 'monster', 'forest_edge').length).toBeGreaterThan(0);
    expect(g.world.slices.world.weather).toBe('storm');
    const entry = g.world.slices.goddess.ledger.at(-1);
    expect(entry?.goddess).toBe('sylvie');
    expect(entry?.sediment).toBe(300);
    expect(g.world.meta.flags['sediment.forest_edge']).toBe(300);
    expect(activeModifiers(g.world, 'sediment', 'forest_edge').length).toBe(1);
    expect(g.world.slices.goddess.goddesses.sylvie?.power).toBe(4000);
    // price modifiers are clamped
    expect(
      code(act(g, { goddessId: 'merca', action: 'price', params: { factor: 3, goods: 'salt' } })),
    ).toBe('ok');
    expect(activeModifiers(g.world, 'price', 'salt')[0]?.factor).toBe(1.4);
    // a task request becomes a flag the quests read
    expect(
      code(
        act(g, {
          goddessId: 'merca',
          action: 'request',
          params: { key: 'safe_caravan', text: '护送北路商队' },
        }),
      ),
    ).toBe('ok');
    expect(g.world.meta.flags['request.merca.safe_caravan']).toBe('护送北路商队');
    expect(g.world.slices.quests.quests.q_gl_merca_01).toBeDefined();
  });

  it('lets each goddess breach once per act and spends the hostility budget', () => {
    const g = game('off', 'act3');
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 5, y: 5 });
    g.step(1);
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'miracle',
          params: { mapId: 'borderstone' },
          breach: true,
        }),
      ),
    ).toBe('ok');
    expect(g.world.slices.goddess.breaches.length).toBe(1);
    expect(g.world.meta.flags['breach.eluen.act3']).toBe(true);
    expect(g.world.slices.goddess.goddesses.eluen?.power).toBe(2000 - 20);
    resetCooldowns(g, 'eluen');
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'miracle',
          params: { mapId: 'borderstone' },
          breach: true,
        }),
      ),
    ).toBe('breach_used');
    expect(
      code(
        act(g, {
          goddessId: 'eluen',
          action: 'oracle',
          params: { mapId: 'borderstone', text: '光。' },
          breach: true,
        }),
      ),
    ).toBe('not_breachable');
    // hostility against the player's map: two per act
    for (let i = 0; i < 2; i++) {
      resetCooldowns(g, 'valda');
      expect(
        code(
          act(g, { goddessId: 'valda', action: 'monster_tide', params: { mapId: 'borderstone' } }),
        ),
      ).toBe('ok');
    }
    resetCooldowns(g, 'valda');
    expect(
      code(
        act(g, { goddessId: 'valda', action: 'monster_tide', params: { mapId: 'borderstone' } }),
      ),
    ).toBe('hostility_budget');
  });
});

describe('planning, sight and wake-ups', () => {
  it('files one plan per active goddess each day with a leak-free context', () => {
    const g = game('external');
    g.step(tickAtDay(1, 0, 1) - g.tick);
    const plans = g.world.ai.pending.filter((r) => r.role === 'goddess.plan');
    expect(plans.map((r) => r.agentId).sort()).toEqual(['eluen', 'merca', 'moira', 'sylvie']);
    for (const r of plans) {
      expect(r.allowed).toContain('goddess.act');
      expect(scanForLeaks(renderTextDeep(r.context), g.world, g.content), r.agentId).toEqual([]);
    }
  });

  it('runs the utility fallback without a model and records it in the miracle ledger', () => {
    const g = game('off');
    g.step(tickAtDay(3, 0, 2) - g.tick);
    expect(g.world.slices.goddess.ledger.length).toBeGreaterThan(0);
    expect(g.world.slices.goddess.goddesses.eluen?.power).toBeGreaterThan(2000);
    // the public record shows only public acts before the review opens
    expect(divineRecord(g.world).every((e) => e.public)).toBe(true);
  });

  it('wakes a goddess on her honorific and raises her sight', () => {
    expect(
      honorificsIn('交易与丰饶之司 梅尔卡奥蕾拉，听我说', narrativeContent().goddesses, {}),
    ).toEqual(['merca']);
    expect(honorificsIn('梅尔卡', narrativeContent().goddesses, {})).toEqual([]);
    expect(honorificsIn('门扉与可能之司，雅努·珀尔塔', narrativeContent().goddesses, {})).toEqual(
      [],
    );
    const before = 0;
    // player.said as the dialogue system would emit it
    const said: GameSystem = {
      id: 'zz_say',
      order: 998,
      commands: {
        'probe.give'(ctx) {
          ctx.emit('player.said', {
            text: '交易与丰饶之司，梅尔卡·奥蕾拉。',
            mapId: 'divine_court',
          });
          return ok();
        },
      },
    };
    const g2 = Engine.create(5, narrativeContent(), [...NARRATIVE_SYSTEMS, said], {
      aiMode: 'external',
    });
    g2.queue('flag.set', { key: 'act', value: 'act1' });
    g2.step(1);
    g2.queue('probe.give', { item: 'x' });
    g2.step(1);
    expect(g2.world.slices.goddess.goddesses.merca?.gaze).toBeGreaterThan(before);
    const wake = g2.world.ai.pending.find(
      (r) => r.role === 'goddess.dialogue' && r.agentId === 'merca',
    );
    expect(wake?.fallback[0]?.kind).toBe('goddess.say');
    expect(
      g2.world.recent.some((e) => e.kind === 'goddess.woken' && e.data.goddessId === 'merca'),
    ).toBe(true);
  });

  it('raises gaze when believers witness a feat, within the act clamp', () => {
    const feats: GameSystem = {
      id: 'zz_feat',
      order: 997,
      tick(ctx) {
        if (ctx.tick % 2 === 0 && ctx.tick < 60) {
          const p = ctx.world.slices.world.entities.player;
          ctx.emit('feat.performed', {
            actorId: 'player',
            kind: 'boss_kill',
            tier: 5,
            mapId: p?.mapId ?? '',
            x: p?.x ?? 0,
            y: p?.y ?? 0,
          });
        }
      },
    };
    const g2 = Engine.create(5, narrativeContent(), [...NARRATIVE_SYSTEMS, probe, feats], {});
    g2.queue('flag.set', { key: 'act', value: 'act1' });
    g2.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 5, y: 5 });
    g2.step(2);
    g2.queue('probe.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
    g2.step(60);
    const eluen = g2.world.slices.goddess.goddesses.eluen;
    expect(eluen?.gaze).toBe(15);
    expect(g2.world.meta.flags['goddess.eluen.gaze']).toBe(15);
    g2.queue('flag.set', { key: 'act', value: 'act3' });
    g2.step(1);
    expect(g2.world.slices.goddess.goddesses.eluen?.gaze).toBeGreaterThan(15);
  });
});

describe('offerings, revelations and views', () => {
  it('trades an offering through the coin for a blessing or intel', () => {
    const g = game('off');
    g.queue('probe.give', { item: 'relic_receipt' });
    g.queue('goddess.offer', { itemId: 'relic_receipt', want: 'blessing' });
    g.step(1);
    const noCoin = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.offer');
    expect(noCoin?.kind === 'command.result' && noCoin.data.code).toBe('no_coin');
    // the reason names the offering goddess from her card and renders as it always read
    const reason = noCoin?.kind === 'command.result' ? noCoin.data.reason : undefined;
    expect(reason).toEqual(tr('sys.goddess.reject.no_coin', { goddess: '梅尔卡' }));
    expect(t(reason)).toBe('没有梅尔卡的硬币，联系不上她');
    g.queue('probe.give', { item: 'merca_coin' });
    g.queue('flag.set', { key: 'p_coin_terms', value: 'interest_free' });
    g.queue('goddess.offer', { itemId: 'relic_receipt', want: 'blessing' });
    g.step(1);
    expect(countItem(g.world, 'player', 'relic_receipt')).toBe(0);
    expect(g.world.meta.flags.merca_offerings).toBe(1);
    expect(activeModifiers(g.world, 'xp', 'player').some((m) => m.source === 'merca')).toBe(true);
    expect(g.world.slices.goddess.goddesses.merca?.relation).toBe(6);
    g.queue('probe.give', { item: 'raven_black_feather' });
    g.queue('goddess.offer', { itemId: 'raven_black_feather', want: 'intel' });
    g.step(1);
    expect(g.world.meta.flags['intel.merca.salt_hoard']).toBe(true);
    const notes = g.world.slices.goddess.ledger
      .filter((e) => e.action === 'offering')
      .map((e) => e.note);
    expect(notes).toEqual([
      tr('sys.goddess.note.offering_blessing', { goddess: '梅尔卡' }),
      tr('sys.goddess.note.offering_intel', { goddess: '梅尔卡' }),
    ]);
    const blessing = activeModifiers(g.world, 'xp', 'player').find((m) => m.source === 'merca');
    expect(t(blessing?.note)).toBe('梅尔卡的附物加护（硬币）');
  });

  it('lands revelations: rules first, then the steles, then every goddess reads them', () => {
    const g = game('off', 'act4');
    g.queue('maker.revelation', { id: 'ash_full' });
    g.step(1);
    expect(g.world.meta.flags.a4_revelation_ash_full).toBe(true);
    expect(activeModifiers(g.world, 'monster', 'ash_waste').some((m) => m.source === 'maker')).toBe(
      true,
    );
    expect(
      g.world.recent.some(
        (e) => e.kind === 'dialogue.line' && t(e.data.text).includes('荒原之澱满。'),
      ),
    ).toBe(true);
    g.step(1);
    const readings = g.world.recent.filter(
      (e) => e.kind === 'dialogue.line' && e.data.kind === 'divine',
    );
    expect(
      new Set(readings.map((e) => (e.kind === 'dialogue.line' ? e.data.speakerId : ''))).size,
    ).toBe(5);
    g.queue('maker.revelation', { id: 'ash_full' });
    g.queue('maker.revelation', { text: '北境之雪不止。' });
    g.queue('maker.revelation', {
      text: '北境之雪不止。',
      modifier: { target: 'harvest', key: 'borderstone', factor: 0.8, days: 30 },
    });
    g.step(1);
    const results = g.world.recent.filter(
      (e) => e.kind === 'command.result' && e.data.kind === 'maker.revelation',
    );
    expect(
      results
        .slice(-3)
        .map((e) => (e.kind === 'command.result' ? (e.data.ok ? 'ok' : e.data.code) : '')),
    ).toEqual(['already', 'no_rule', 'ok']);
  });

  it('shows the player only what the player can know', () => {
    const g = game('off');
    const v = goddessView(g.world, g.content);
    expect(v.map((x) => x.id)).not.toContain('janu');
    expect(v.find((x) => x.id === 'eluen')?.gazeBand).toEqual(tr('sys.goddess.gaze.unknown'));
    g.queue('flag.set', { key: 'a1_dream_door_woman', value: true });
    g.step(1);
    const janu = goddessView(g.world, g.content).find((x) => x.id === 'janu');
    expect(janu?.name).toBe('门口的女人');
    expect(janu?.honorific).toBeNull();
  });
});

describe('reveal ledger in prompts', () => {
  it('keeps every goddess prompt free of locked knowledge at the start of every act', () => {
    const g = narrativeGame({ seed: 13 });
    const checked: string[] = [];
    const scan = (world: typeof g.world, act: string) => {
      const ctx = {
        world,
        content: g.content,
        flag: (k: string) => world.meta.flags[k],
      } as unknown as SystemContext;
      for (const def of g.content.goddesses) {
        const s = world.slices.goddess.goddesses[def.id];
        // Janu is never asked before her first dream (planning.ts dailyPlans)
        if (!s || (def.id === 'janu' && !world.meta.flags.a1_dream_door_woman)) continue;
        const context = goddessContext(ctx, def, s, '测试');
        expect(scanForLeaks(renderTextDeep(context), world, g.content), `${act} ${def.id}`).toEqual(
          [],
        );
      }
      checked.push(act);
    };
    g.onEvents((events, world) => {
      for (const e of events) if (e.kind === 'act.changed') scan(world, e.data.to);
    });
    g.step(1);
    scan(g.world, 'prologue');
    playThrough(g);
    expect(checked).toEqual([
      'prologue',
      'act1',
      'act2',
      'act3',
      'act4',
      'act5',
      'act6',
      'epilogue',
    ]);
  });
});

describe('goddess text keys', () => {
  it('renders the planning situation and the command help as the old prompt text', () => {
    const g = game('off');
    const def = g.content.goddesses.find((d) => d.id === 'eluen');
    const s = g.world.slices.goddess.goddesses.eluen;
    if (!def || !s) throw new Error('eluen missing');
    const ctx = {
      world: g.world,
      content: g.content,
      tick: g.tick,
      flag: (k: string) => g.world.meta.flags[k],
    } as unknown as SystemContext;
    const text = t(planSituation(ctx, def, s));
    expect(text.startsWith(`圣历 998 年春第 1 日。你的神力 ${Math.round(s.power)}。`)).toBe(true);
    expect(text).toContain('你对那个人几乎一无所知，只当传闻；你对那个人的态度：平淡。');
    const help = renderTextDeep(goddessContext(ctx, def, s, '测试').commands) as Record<
      string,
      string
    >;
    expect(help['goddess.say']).toBe(
      "数据 {goddessId:'eluen', text, revision}：以你的口吻说一句话。",
    );
    expect(
      help['goddess.act']?.startsWith("数据 {goddessId:'eluen', action, revision, params"),
    ).toBe(true);
  });

  it('flags the hidden goddess name spoken before it is revealed, from her card', () => {
    const say: GameSystem = {
      id: 'zz_say_name',
      order: 998,
      commands: {
        'probe.give'(ctx, d) {
          ctx.emit('player.said', { text: d.item, mapId: 'divine_court' });
          return ok();
        },
      },
    };
    const g = Engine.create(5, narrativeContent(), [...NARRATIVE_SYSTEMS, say], { aiMode: 'off' });
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('probe.give', { item: '那扇门后的人叫雅努吗' });
    g.step(2);
    expect(g.world.meta.flags['player.spoke_forbidden_name']).toBe(true);
    const g2 = Engine.create(5, narrativeContent(), [...NARRATIVE_SYSTEMS, say], { aiMode: 'off' });
    g2.queue('flag.set', { key: 'a6_name_spoken', value: true });
    g2.queue('probe.give', { item: '雅努' });
    g2.step(2);
    expect(g2.world.meta.flags['player.spoke_forbidden_name']).toBeUndefined();
  });
});

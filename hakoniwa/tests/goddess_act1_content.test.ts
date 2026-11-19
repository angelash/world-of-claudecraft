// Act-1 goddess content (PK-M1-34; catalog_goddess_interventions.md 1.6, 2, 5.3, 6 and 10;
// catalog_dialogue_lines.md 1.6): the act-1 action rows load clean with the catalog's values,
// Eluen's act-1 feat row raises her gaze by the catalog's 5 within her cap and stays out of
// act 2, every goddess's oracle, dream and omen slots resolve from her own pack in act 1, and
// "the salt and potions of the monster season" reaches its intel step and aborts when the
// dispute settles.

import { describe, expect, it } from 'vitest';
import { pack as goddessPack } from '../src/content/packs/goddess';
import { Engine, ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  actParams,
  advanceSchemes,
  goddessDef,
  goddessLine,
  personaOf,
  stepSchemes,
  validateAct,
} from '../src/systems/goddess';
import { mapById, spawnEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk34.run': Record<string, never>;
    'pk34.believer': { tags: string[]; mapId: string };
  }
}

function at(content: ContentMap, mapId: string, loc: string): { x: number; y: number } {
  const map = mapById(content, mapId);
  const l = map?.locations.find((x) => x.id === loc) ?? map?.locations[0];
  if (!l) throw new Error(`no places on ${mapId}`);
  return { x: l.x + Math.floor(l.w / 2), y: l.y + Math.floor(l.h / 2) };
}

let job: ((ctx: SystemContext) => void) | null = null;

const probe: GameSystem = {
  id: 'zz_pk34',
  order: 999,
  commands: {
    'pk34.run'(ctx) {
      job?.(ctx);
      job = null;
      return ok();
    },
    'pk34.believer'(ctx, d) {
      spawnEntity(ctx, {
        kind: 'npc',
        name: '信徒',
        mapId: d.mapId,
        ...at(ctx.content, d.mapId, 'plaza'),
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', ...d.tags],
      });
      return ok();
    },
  },
};

function inTick<T>(g: Engine, fn: (ctx: SystemContext) => T): T {
  let out: T | undefined;
  job = (ctx) => {
    out = fn(ctx);
  };
  g.queue('pk34.run', {});
  g.step(1);
  return out as T;
}

function game(act = 'act1'): Engine {
  const g = Engine.create(7, narrativeContent(), [...NARRATIVE_SYSTEMS, otherTeamsStub, probe], {
    aiMode: 'off',
  });
  g.queue('flag.set', { key: 'act', value: act });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.queue('world.teleport', {
    entityId: 'player',
    mapId: 'borderstone',
    ...at(g.content, 'borderstone', 'plaza'),
  });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

/** The oracle-class slot of each action per goddess (the lead's writtenText wiring). */
const ORACLE_SLOTS: Record<string, Record<string, string>> = {
  eluen: { oracle: 'react.oracle_instruct' },
  valda: { oracle: 'react.oracle_instruct' },
  merca: { oracle: 'react.oracle_instruct' },
  sylvie: {
    oracle: 'react.oracle_instruct',
    dream: 'react.dream_vision',
    omen: 'react.omen_beast',
  },
  moira: { oracle: 'react.oracle_instruct' },
};

describe('act-1 divine actions (catalog 2)', () => {
  it('load clean through the goddess pack validation', () => {
    const c = narrativeContent();
    const problems = goddessPack.validate?.(c) ?? [];
    expect(problems.filter((p) => p.startsWith('divine action'))).toEqual([]);
    // every pack slot an action names for a goddess is in her pack (PK-M1-34)
    expect(problems.filter((p) => p.startsWith('action '))).toEqual([]);
    expect(problems.filter((p) => p.startsWith('scheme'))).toEqual([]);
    expect(problems.filter((p) => p.startsWith('reaction'))).toEqual([]);
  });

  it('carry the catalog values on the amended and the added rows', () => {
    const c = narrativeContent();
    const a = (id: string) => c.divineActions.find((x) => x.id === id);
    // div_all_commission: the same organisation every 3 days
    expect(a('request')?.cooldownHours).toBe(72);
    // div_sylvie_bless: an act-1 blessing of her believers, quiet, through the narrate executor
    expect(a('div_sylvie_bless')).toMatchObject({
      minAct: 1,
      exec: 'narrate',
      needs: ['believer'],
      seen: 'never',
      visibility: 'hidden',
      cooldownHours: 720,
      sedimentRate: 0.1,
    });
    // div_sylvie_migration: act 2, public, the travel channel +15% for the default week
    expect(a('div_sylvie_migration')).toMatchObject({
      minAct: 2,
      exec: 'narrate',
      visibility: 'public',
      seen: 'map',
      modifiers: [{ target: 'travel', key: 'region', factor: 1.15, hours: 168 }],
    });
  });
});

describe('Eluen files an act-1 feat as believers’ exaggeration (div_react_eluen_01)', () => {
  it('raises her gaze by 5 within the act-1 cap, and leaves act 2 to the shared row', () => {
    const g = game();
    g.queue('pk34.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
    g.step(1);
    const before = g.world.slices.goddess.goddesses.eluen?.gaze ?? 0;
    g.queue('stub.feat', { tier: 3 });
    g.step(1);
    const fired = g.world.recent.flatMap((e) =>
      e.kind === 'goddess.reacted' && e.data.goddessId === 'eluen' ? [e.data.rowId] : [],
    );
    expect(fired).toEqual(['div_react_eluen_01']);
    const after = g.world.slices.goddess.goddesses.eluen?.gaze ?? 0;
    expect(after - before).toBeGreaterThanOrEqual(4);
    expect(after - before).toBeLessThanOrEqual(5);
    expect(after).toBeLessThanOrEqual(15);
    const memo = g.world.recent.find(
      (e) => e.kind === 'goddess.memo' && e.data.goddessId === 'eluen',
    );
    expect(memo?.kind === 'goddess.memo' && memo.data.note).toBe('believers_exaggerate');
    // act 2: her act-1 row stays silent
    const g2 = game('act2');
    g2.queue('pk34.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
    g2.step(1);
    g2.queue('stub.feat', { tier: 3 });
    g2.step(1);
    const rows2 = g2.world.recent.flatMap((e) =>
      e.kind === 'goddess.reacted' && e.data.goddessId === 'eluen' ? [e.data.rowId] : [],
    );
    expect(rows2).not.toContain('div_react_eluen_01');
  });
});

describe('oracle, dream and omen text from her own pack (catalog 1.1, 1.6)', () => {
  it('the actions name exactly these slots in the data (Janu dreams from her own pack)', () => {
    const c = narrativeContent();
    const named: Record<string, Record<string, string>> = {};
    for (const a of c.divineActions)
      for (const [goddess, slot] of Object.entries(a.slots ?? {})) {
        named[goddess] ??= {};
        (named[goddess] as Record<string, string>)[a.id] = slot;
      }
    expect(named).toEqual({ ...ORACLE_SLOTS, janu: { dream: 'greet.neutral.dream' } });
  });

  it('the planner names her slot and the act speaks a key of her pack, never a sentence', () => {
    const g = game();
    const c = g.content;
    const def = c.goddesses.find((x) => x.id === 'merca');
    const oracle = c.divineActions.find((x) => x.id === 'oracle');
    if (!def || !oracle) throw new Error('fixture');
    const params = inTick(g, (ctx) => actParams(ctx, def, oracle, 'borderstone'));
    expect(params?.slot).toBe('react.oracle_instruct');
    expect(params?.text).toBeUndefined();
    // a model may not pass a slot: the arbiter refuses it
    const refusal = inTick(g, (ctx) =>
      validateAct(
        ctx,
        {
          goddessId: 'merca',
          action: 'oracle',
          revision: g.world.slices.goddess.goddesses.merca?.revision ?? 0,
          params: { mapId: 'borderstone', slot: 'react.oracle_instruct' },
        },
        { type: 'ai', agentId: 'merca', requestId: 'r1' },
      ),
    );
    expect(refusal?.code).toBe('no_text');
    // nor a slot the action does not declare for her, from any source
    const wrong = inTick(g, (ctx) =>
      validateAct(
        ctx,
        {
          goddessId: 'merca',
          action: 'oracle',
          revision: g.world.slices.goddess.goddesses.merca?.revision ?? 0,
          params: { mapId: 'borderstone', slot: 'react.coin_first' },
        },
        { type: 'system', system: 'goddess' },
      ),
    );
    expect(wrong?.code).toBe('no_text');
  });

  it('resolves every oracle-class slot of each goddess in act 1 to a line of her pack', () => {
    const g = game();
    for (const [goddess, slots] of Object.entries(ORACLE_SLOTS))
      for (const slot of Object.values(slots)) {
        const line = inTick(g, (ctx) => goddessLine(ctx, goddess, slot));
        expect(line, `${goddess} ${slot}`).toEqual({
          key: expect.stringMatching(
            new RegExp(
              `^c\\.line_packs\\.ln_${goddess}\\.slots\\.${slot.replace('.', '_')}\\.\\d+$`,
            ),
          ),
        });
        const pack = g.content.linePacks.find((p) => p.id === `ln_${goddess}`);
        expect(
          ((pack?.slots[slot] ?? []) as unknown[]).length,
          `${goddess} ${slot}`,
        ).toBeGreaterThanOrEqual(5);
      }
  });

  it('gives no oracle slot to a goddess without one (the caller falls back)', () => {
    const g = game();
    expect(inTick(g, (ctx) => goddessLine(ctx, 'eluen', 'react.omen_beast'))).toBeNull();
    expect(inTick(g, (ctx) => goddessLine(ctx, 'janu', 'react.oracle_instruct'))).toBeNull();
  });
});

describe('the salt and potions of the monster season (catalog 5.3)', () => {
  const SCHEME = 'div_plan_merca_salt_season';

  function adopt(g: Engine): void {
    g.queue('flag.set', { key: 'act_week', value: 3 });
    g.step(1);
    inTick(g, (ctx) => {
      const def = goddessDef(ctx.content, 'merca');
      const s = ctx.world.slices.goddess.goddesses.merca;
      if (!def || !s) throw new Error('no merca');
      ctx.world.slices.goddess.brains = ctx.world.slices.goddess.brains ?? {};
      stepSchemes(ctx, def, s, personaOf(ctx.content, 'merca'), [SCHEME]);
    });
  }

  const run = (g: Engine) =>
    g.world.slices.goddess.brains?.merca?.plans.find((p) => p.scheme === SCHEME);

  it('reaches its intel step after the price push, and ends done once the hoard is sold', () => {
    const g = game();
    adopt(g);
    const r = run(g);
    expect(r?.steps).toEqual([`${SCHEME}#0.0`, `${SCHEME}#0.1`]);
    expect(r?.index).toBe(0);
    inTick(g, (ctx) => advanceSchemes(ctx, 'merca', { action: 'price', mapId: 'borderstone' }));
    expect(run(g)?.index).toBe(1);
    inTick(g, (ctx) => advanceSchemes(ctx, 'merca', { on: 'intel' }));
    expect(run(g)).toBeUndefined();
    expect(g.world.slices.goddess.brains?.merca?.ended.at(-1)).toMatchObject({
      scheme: SCHEME,
      how: 'done',
    });
  });

  it('aborts when the salt and potions dispute settles', () => {
    const g = game();
    adopt(g);
    expect(run(g)).toBeDefined();
    g.queue('flag.set', { key: 'dispute.q_a1_d03_salt_and_potions.ending', value: 'settled' });
    g.step(1);
    inTick(g, (ctx) => {
      const def = goddessDef(ctx.content, 'merca');
      const s = ctx.world.slices.goddess.goddesses.merca;
      if (def && s) stepSchemes(ctx, def, s, personaOf(ctx.content, 'merca'));
    });
    expect(run(g)).toBeUndefined();
    expect(g.world.slices.goddess.brains?.merca?.ended.at(-1)).toMatchObject({
      scheme: SCHEME,
      how: 'aborted',
    });
  });
});

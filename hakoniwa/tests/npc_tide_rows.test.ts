// A named person's row on the tide night through `tide.act` (PK-M1-21 for PK-M1-52;
// act1_borderstone.md 8.4; builtin_ai.md 1.2, 5.8): the built-in pick is the table's first
// legal row, only actors with a real choice and a phase left to act in file a request, the
// empty fallback leaves the kernel's own pick standing, a model's legal row holds from the
// next phase, and one seed settles one night. The real game with every system
// (tests/tide_harness.ts).

import { describe, expect, it } from 'vitest';
import type { AiContextV1 } from '../src/core/ai_port';
import { builtinRow } from '../src/systems/npc/brain/tide_rows';
import type { ActorRowDef } from '../src/systems/tide/types';
import {
  begin,
  fell,
  game,
  NPC_SOURCE,
  night,
  numbers,
  ofKind,
  stand,
  toDawn,
  untilStage,
  wholeNight,
} from './tide_harness';

const row = (id: string): ActorRowDef => ({ id, label: 'zz' });

interface Menu {
  agentId: string;
  role: string;
  fallback: number;
  options: string[];
  suggested: string;
}

/** Every tide_row request as it is filed (the menu, the suggestion, the fallback's size). */
function asked(t: ReturnType<typeof game>): Menu[] {
  const out: Menu[] = [];
  t.g.onEvents((evs) => {
    for (const e of evs) {
      if (e.kind !== 'ai.requested' || e.data.purpose !== 'tide_row') continue;
      const r = t.g.world.ai.pending.find((x) => x.id === e.data.requestId);
      const extra = (r?.context as AiContextV1 | undefined)?.extra as
        | { options: { id: string }[]; suggested: string }
        | undefined;
      out.push({
        agentId: e.data.agentId,
        role: e.data.role,
        fallback: r?.fallback.length ?? -1,
        options: extra?.options.map((o) => o.id) ?? [],
        suggested: extra?.suggested ?? '',
      });
    }
  });
  return out;
}

describe('the built-in row (8.4: the first legal one)', () => {
  it('a choice of two or more takes the first; a single row is no choice', () => {
    expect(builtinRow([row('a'), row('b')])).toBe('a');
    expect(builtinRow([row('a')])).toBeNull();
    expect(builtinRow([])).toBeNull();
  });
});

describe('the tide night with the NPC brain choosing', () => {
  // Barto's family is safe and he trusts the player: both "hold" and "chapel" are open to him
  const CHOICE = { a1_barto_family_safe: true, 'trust.barto': 60 };

  it('an actor with a choice files a request; with no model the kernel keeps its own row', () => {
    const t = game(7, CHOICE);
    const menus = asked(t);
    wholeNight(t, 'north_gate');
    expect(menus.length).toBeGreaterThan(0);
    // the menu is Barto's legal rows, the suggestion the row the kernel would take
    for (const m of menus) {
      expect(m).toEqual({
        agentId: 'barto',
        role: 'npc.decision_point',
        fallback: 0,
        options: ['hold', 'chapel'],
        suggested: 'hold',
      });
    }
    // with the AI off the empty fallback writes nothing: the table's own rule runs
    expect(ofKind(t, 'command.result').filter((e) => e.data.kind === 'tide.act')).toEqual([]);
    expect(night(t)?.chosen).toEqual({});
    expect(night(t)?.picks.wave1?.barto).toEqual(['hold']);
  });

  it('a row the model names is the suggestion of the next phase and holds', () => {
    const t = game(7, CHOICE);
    const menus = asked(t);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 1);
    const before = menus.length;
    t.g.queue('tide.act', { actor: 'barto', row: 'chapel' }, NPC_SOURCE);
    t.g.step(1);
    fell(t);
    toDawn(t);
    // every later phase suggests the named row and the kernel keeps it
    expect(menus.length).toBeGreaterThan(before);
    expect(menus.slice(before).every((m) => m.suggested === 'chapel')).toBe(true);
    expect(night(t)?.chosen).toEqual({ barto: 'chapel' });
  });

  it('nobody with a single legal row is asked; one seed settles the same night twice', () => {
    const t = game(7);
    wholeNight(t, 'north_gate');
    expect(ofKind(t, 'ai.requested').filter((e) => e.data.purpose === 'tide_row')).toEqual([]);
    // the same seed and story twice: the same night at dawn
    const a = game(7, CHOICE);
    wholeNight(a, 'north_gate');
    const b = game(7, CHOICE);
    wholeNight(b, 'north_gate');
    expect(numbers(a)).toEqual(numbers(b));
  });
});

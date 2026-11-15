// World inspector model: speed pacing, event buffers and filters, entity filters,
// flag input, calendar text, and the determinism checks run on the real game.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as worldPack } from '../src/content/packs/world';
import type { AnyWorldEvent } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import { worldHash } from '../src/core/save';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../src/core/time';
import {
  EDITOR_SOURCE,
  externalInputs,
  filterEntities,
  flagRows,
  formatCalendar,
  parseCommandText,
  parseFlagInput,
  Ring,
  replayHash,
  runTwice,
  runWithInputs,
  selectEvents,
  sourceLabel,
  ticksForFrame,
} from '../src/editor/inspector/inspector_model';
import { system as inventorySystem } from '../src/systems/inventory';
import { system as modifiersSystem } from '../src/systems/modifiers';
import { system as worldSystem } from '../src/systems/world';
import type { Entity } from '../src/systems/world/types';

// The kernel-owned systems and packs only (the same factory shape the inspector uses
// with createGame), so these tests do not depend on other teams' work in progress.
const CONTENT = buildContent([worldPack, inventoryPack]);
const SYSTEMS = [modifiersSystem, worldSystem, inventorySystem];
const make = (seed: number) => Engine.create(seed, CONTENT, SYSTEMS, { aiMode: 'off' });

describe('ticksForFrame', () => {
  it('runs 20 ticks per real second at 1x and scales with speed', () => {
    expect(ticksForFrame(1000, 1, 0)).toEqual({ ticks: 20, carry: 0 });
    expect(ticksForFrame(1000, 100, 0).ticks).toBe(2000);
  });

  it('carries fractions across frames', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const r = ticksForFrame(1000 / 60, 1, carry);
      total += r.ticks;
      carry = r.carry;
    }
    expect(total).toBe(20);
  });

  it('caps a long frame and drops the backlog', () => {
    expect(ticksForFrame(60_000, 100, 0.5, 500)).toEqual({ ticks: 500, carry: 0 });
    expect(ticksForFrame(-5, 1, 0)).toEqual({ ticks: 0, carry: 0 });
  });
});

describe('Ring', () => {
  it('keeps the newest items and counts everything pushed', () => {
    const r = new Ring<number>(3);
    r.push(1, 2);
    r.push(3, 4, 5);
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.size).toBe(3);
    expect(r.total).toBe(5);
    r.clear();
    expect(r.size).toBe(0);
  });
});

describe('filters', () => {
  const ev = (kind: string, data: unknown, seq: number) =>
    ({ kind, tick: seq, seq, data }) as unknown as AnyWorldEvent;
  const events = [
    ev('world.hour', { hour: 7 }, 1),
    ev('flag.changed', { key: 'act' }, 2),
    ev('world.hour', { hour: 8 }, 3),
  ];

  it('selects newest-first events by kind and text', () => {
    expect(selectEvents(events, '', '', 10).map((e) => e.seq)).toEqual([3, 2, 1]);
    expect(selectEvents(events, 'world.hour', '', 10).map((e) => e.seq)).toEqual([3, 1]);
    expect(selectEvents(events, '', '"act"', 10).map((e) => e.seq)).toEqual([2]);
    expect(selectEvents(events, '', '', 2).map((e) => e.seq)).toEqual([3, 2]);
  });

  it('filters entities by map, kind and text', () => {
    const mk = (id: string, kind: Entity['kind'], mapId: string, tags: string[] = []) =>
      ({ id, kind, mapId, name: id.toUpperCase(), tags, ref: `${id}_ref` }) as Entity;
    const all = [
      mk('wolf_2', 'monster', 'forest', ['hostile']),
      mk('player', 'player', 'town'),
      mk('wolf_1', 'monster', 'town'),
    ];
    expect(filterEntities(all, {}).map((e) => e.id)).toEqual(['player', 'wolf_1', 'wolf_2']);
    expect(filterEntities(all, { mapId: 'town' }).map((e) => e.id)).toEqual(['player', 'wolf_1']);
    expect(filterEntities(all, { kind: 'monster', mapId: 'town' }).map((e) => e.id)).toEqual([
      'wolf_1',
    ]);
    expect(filterEntities(all, { text: 'HOSTILE' }).map((e) => e.id)).toEqual(['wolf_2']);
    expect(filterEntities(all, { text: 'player_ref' }).map((e) => e.id)).toEqual(['player']);
  });
});

describe('flags and commands', () => {
  it('parses flag values by type', () => {
    expect(parseFlagInput('3.5', 'number')).toEqual({ ok: true, value: 3.5 });
    expect(parseFlagInput('', 'number').ok).toBe(false);
    expect(parseFlagInput('x', 'number').ok).toBe(false);
    expect(parseFlagInput('true', 'boolean')).toEqual({ ok: true, value: true });
    expect(parseFlagInput('1', 'boolean').ok).toBe(false);
    expect(parseFlagInput(' act1 ', 'string')).toEqual({ ok: true, value: ' act1 ' });
  });

  it('sorts flags by key', () => {
    expect(flagRows({ b: 1, a: true }).map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('parses typed commands', () => {
    expect(parseCommandText('{"kind":"flag.set","data":{"key":"a","value":1}}')).toEqual({
      ok: true,
      kind: 'flag.set',
      data: { key: 'a', value: 1 },
    });
    expect(parseCommandText('{"kind":"x"}')).toEqual({ ok: true, kind: 'x', data: {} });
    expect(parseCommandText('[1]').ok).toBe(false);
    expect(parseCommandText('{"data":{}}').ok).toBe(false);
    expect(parseCommandText('{oops').ok).toBe(false);
  });

  it('labels command sources', () => {
    expect(sourceLabel({ type: 'player' })).toBe('玩家');
    expect(sourceLabel(EDITOR_SOURCE)).toBe('脚本 editor.inspector');
    expect(sourceLabel({ type: 'fallback', agentId: 'oola', requestId: 'ai3' })).toBe('兜底 oola');
  });
});

describe('calendar', () => {
  it('formats the opening moment and later times', () => {
    expect(formatCalendar(calendarAt(0))).toBe('圣历 998 年 春 第 1 日 06:00');
    expect(formatCalendar(calendarAt(TICKS_PER_GAME_HOUR * 20 + 20 * 5))).toBe(
      '圣历 998 年 春 第 2 日 02:05',
    );
  });
});

describe('determinism checks', () => {
  it('two runs with the same seed and inputs hash the same', () => {
    const inputs = [
      {
        tick: 3,
        command: {
          kind: 'world.move_to' as const,
          data: { entityId: 'player', x: 17.5, y: 9.5 },
          source: { type: 'player' as const },
        },
      },
      {
        tick: 40,
        command: {
          kind: 'flag.set' as const,
          data: { key: 'act', value: 'act1' },
          source: EDITOR_SOURCE,
        },
      },
    ];
    const r = runTwice(make, 7, 400, inputs);
    expect(r.same).toBe(true);
    expect(r.hashA).toBe(r.hashB);
    const other = runTwice(make, 7, 400, inputs.slice(0, 1));
    expect(other.hashA).not.toBe(r.hashA);
  });

  it('detects a non-deterministic factory', () => {
    let n = 0;
    const flaky = (seed: number) => make(seed + n++);
    // The second world silently gets another seed, which the hash covers (world.meta).
    const r = runTwice(flaky, 1, 100, []);
    expect(r.same).toBe(false);
  });

  it('feeds inputs right before their logged tick, matching a live run', () => {
    const live = make(11);
    live.step(9);
    live.queue('world.move_to', { entityId: 'player', x: 17.5, y: 9.5 });
    live.queue('flag.set', { key: 'seen', value: true }, EDITOR_SOURCE);
    live.step(200);
    const inputs = externalInputs(live.world.log);
    expect(inputs.map((l) => l.tick)).toEqual([10, 10]);
    expect(runWithInputs(make(11), 209, inputs)).toBe(worldHash(live.world));
  });

  it('a replay of the live log reproduces the live world', () => {
    const live = make(5);
    live.queue('world.move_to', { entityId: 'player', x: 10.5, y: 3.5 });
    live.step(150);
    live.queue('flag.set', { key: 'quest.test', value: 'active' }, EDITOR_SOURCE);
    live.step(150);
    expect(replayHash(5, live.content, live.systems, live.world.log, live.tick)).toBe(
      worldHash(live.world),
    );
    expect(replayHash(5, live.content, live.systems, [], live.tick)).not.toBe(
      worldHash(live.world),
    );
  });
});

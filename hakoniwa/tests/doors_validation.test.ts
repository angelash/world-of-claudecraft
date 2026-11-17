// Content validation of the doors (thousand_doors.md 21.6; section 23 group V, M1 row):
// the shipped doors pass, and each of the eight rules reports its own counterexample.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { validateDoors } from '../src/content/packs/doors';
import type { ContentMap } from '../src/core/contracts';
import type { DoorDef } from '../src/systems/doors/types';
import { door } from './doors_harness';

const BASE = buildContent();

/** The shipped content with `extra` doors added (and optional overrides). */
function withDoors(extra: DoorDef[], over: Partial<ContentMap> = {}): ContentMap {
  return { ...BASE, doors: [...BASE.doors, ...extra], ...over } as ContentMap;
}

function problemsOf(extra: DoorDef[], over: Partial<ContentMap> = {}): string[] {
  return validateDoors(withDoors(extra, over));
}

describe('V: the content rules of 21.6', () => {
  it('the shipped doors pass every rule', () => {
    expect(validateDoors(BASE)).toEqual([]);
  });

  it('rule 1: segment, wing, seal and jam are filled and the wing fits the category', () => {
    const bad = { ...door('v1a'), segment: 0 } as DoorDef;
    expect(problemsOf([bad])).toContain('door v1a: segment missing or out of 1 to 7');
    const noWing = { ...door('v1b') } as Partial<DoorDef>;
    delete noWing.wing;
    expect(problemsOf([noWing as DoorDef])).toContain('door v1b: wing missing or unknown');
    expect(problemsOf([door('v1c', { category: 'vocation', wing: 'mirror' })])).toContain(
      'door v1c: wing mirror does not fit category vocation',
    );
    const noSeal = { ...door('v1d') } as Partial<DoorDef>;
    delete noSeal.seal;
    expect(problemsOf([noSeal as DoorDef])).toContain('door v1d: seal tier missing or unknown');
    const noJam = { ...door('v1e') } as Partial<DoorDef>;
    delete noJam.jam;
    expect(problemsOf([noJam as DoorDef])).toContain('door v1e: jam missing or unknown');
  });

  it('rule 2: every flag, choice, time, know and cond key reads a registered variable', () => {
    const probs = problemsOf([
      door('v2', {
        keys: [
          { type: 'flag', key: 'nobody_registered_this', label: 'a' },
          { type: 'choice', key: 'nor_this_choice', equals: 'x', label: 'b' },
          { type: 'time', key: 'nor_this_moment', label: 'c' },
          { type: 'know', key: 'nor_this_book', label: 'd' },
          { type: 'cond', expr: 'unknown_var >= 3', label: 'e' },
        ],
      }),
    ]);
    for (const name of [
      'nobody_registered_this',
      'nor_this_choice',
      'nor_this_moment',
      'nor_this_book',
      'unknown_var',
    ])
      expect(probs).toContain(`door v2: key reads unregistered variable ${name}`);
    // registered names (a family member, an act flag) pass
    expect(
      problemsOf([
        door('v2ok', {
          keys: [
            { type: 'flag', key: 'trust.oola', min: 10, label: 'a' },
            { type: 'cond', expr: 'a1_oola_fate == cleared', label: 'b' },
          ],
          closable: true,
        }),
      ]).filter((p) => p.includes('unregistered')),
    ).toEqual([]);
  });

  it('rule 3: a key on one person alone, or on a branch deed, needs an alt substitute', () => {
    expect(
      problemsOf([door('v3a', { keys: [{ type: 'trust', npc: 'oola', min: 60, label: 'a' }] })]),
    ).toContain('door v3a: key on oola alone has no alt substitute');
    expect(
      problemsOf([
        door('v3b', { keys: [{ type: 'flag', key: 'trust.oola', min: 60, label: 'a' }] }),
      ]),
    ).toContain('door v3b: key on oola alone has no alt substitute');
    const deeds = [{ id: 'deed_branchy', branch: true }];
    expect(
      problemsOf([door('v3c', { keys: [{ type: 'deed', deed: 'deed_branchy', label: 'a' }] })], {
        deeds,
      } as unknown as Partial<ContentMap>),
    ).toContain('door v3c: branch deed deed_branchy has no alt substitute');
    // inside an alt, or one of several in an any, the person is not alone
    const ok = problemsOf([
      door('v3d', {
        keys: [
          {
            type: 'alt',
            label: 'a',
            of: [
              { type: 'trust', npc: 'oola', min: 60, label: 'a' },
              { type: 'trust', npc: 'baishan', min: 60, label: 'b' },
            ],
          },
        ],
      }),
    ]);
    expect(ok.filter((p) => p.includes('v3d'))).toEqual([]);
  });

  it('rule 4: money cannot buy a door (trade goods and shop stock are no item keys)', () => {
    const wood = problemsOf([door('v4', { keys: [{ type: 'item', itemId: 'wood', label: 'a' }] })]);
    expect(wood).toContain('door v4: item key wood is a trade good or shop stock');
  });

  it('rule 5: no rank key on a story or main-line door', () => {
    expect(
      problemsOf([
        door('v5a', { auto: true, keys: [{ type: 'rank', min: 10, label: 'a' }] }),
        door('v5b', { main: true, keys: [{ type: 'rank', min: 10, label: 'a' }] }),
      ]),
    ).toEqual(
      expect.arrayContaining([
        'door v5a: rank key on a story or main-line door',
        'door v5b: rank key on a story or main-line door',
      ]),
    );
  });

  it("rule 6: no hidden goddess name in a door's visible text before act 6 (D-023)", () => {
    const janu = BASE.goddesses.find((g) => (g as { hiddenName?: string }).hiddenName);
    if (!janu) throw new Error('no hidden-name goddess in the content');
    const probs = problemsOf([door('v6', { act: 3, hint: `门后有${janu.name}的影子` })]);
    expect(probs).toContain(`door v6: visible text names ${janu.name} (D-023)`);
    // a name in an act 6 door is allowed (after the naming)
    expect(
      problemsOf([door('v6ok', { act: 6, hint: `门后有${janu.name}的影子` })]).filter((p) =>
        p.includes('D-023'),
      ),
    ).toEqual([]);
  });

  it('rule 7: exclusion groups have two ends and lawful modes; freeze is X7, rack X13', () => {
    const probs = problemsOf([
      door('v7a', { exclusive: [{ group: 'Q1', mode: 'lock' }] }),
      door('v7b', { exclusive: [{ group: 'Q2', mode: 'freeze' }] }),
      door('v7c', { exclusive: [{ group: 'Q2', mode: 'rack' }] }),
      door('v7d', { exclusive: [{ group: 'Q3', mode: 'explode' as never }] }),
      door('v7e', { exclusive: [{ group: 'Q3', mode: 'actLock' }] }),
    ]);
    expect(probs).toEqual(
      expect.arrayContaining([
        'exclusion group Q1: only one door',
        'door v7b: mode freeze belongs to group X7 only',
        'door v7c: mode rack belongs to group X13 only',
        'door v7d: exclusion mode explode unknown',
        'door v7e: actLock without act',
      ]),
    );
  });

  it('beyond the eight: unknown key types, uncounted events, the forbidden category', () => {
    const probs = problemsOf([
      door('w1', { keys: [{ type: 'level', min: 3, label: 'old' } as never] }),
      door('w2', { keys: [{ type: 'count', event: 'quest.done', count: 1, label: 'q' }] }),
      door('w3', { category: 'forbidden', wing: 'draft' }),
    ]);
    expect(probs).toEqual(
      expect.arrayContaining([
        'door w1: unknown key type level',
        'door w2: count key on quest.done, an event doors does not count',
        'door w3: a forbidden-category door without the forbidden weight',
      ]),
    );
  });

  it('rule 8: the rank curve file matches the formula rank by rank', () => {
    const curve = BASE.door_rank_curve?.thresholds ?? [];
    const bent = [...curve];
    bent[59] = 93;
    const probs = validateDoors({ ...BASE, door_rank_curve: { thresholds: bent } } as ContentMap);
    expect(probs).toContain('door rank curve: rank 60 needs 94, the file says 93');
  });
});

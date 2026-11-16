import { describe, expect, it } from 'vitest';
import specMonsters from '../assets/prompts/specs/monsters.json';
import templatesJson from '../assets/prompts/templates.json';
import monstersJson from '../data/combat/monsters.json';
import {
  ACTION_STRIPS,
  ANIM_SPECS,
  ANIMS,
  type AnimName,
  DIRS,
  type Dir,
  dirFromFacing,
  frameAt,
  MAIN_ONLY_STRIPS,
  PROCEDURAL_POSES,
  proceduralPose,
  stripFrame,
} from '../src/client/sprites/anim_spec';
import { frameCountFor, frameSize, generateFrame, spriteKey } from '../src/client/sprites/generate';
import {
  ARCHETYPES,
  BODY_TEMPLATE,
  bodyOf,
  bodyTemplate,
  CREATURE_BODIES,
  clampScale,
  lookFromAppearance,
  lookFromEntity,
  resolveArchetype,
} from '../src/client/sprites/look';
import { luminance, parseHex, shadeRamp, toHex } from '../src/client/sprites/palette';
import {
  getAlpha,
  getPixel,
  matrixHash,
  mirrorX,
  opaqueBounds,
  opaqueCount,
} from '../src/client/sprites/pixels';
import { ART_ALIASES } from '../tools/assets/core/aliases';
import { frameCells, importSpecFor, type TemplateLike } from '../tools/assets/core/template_specs';

const look = (base: string, scale?: number) =>
  lookFromAppearance({ base, colors: ['#3b4a6b', '#c9b38a', '#f1c9a5', '#2b2b2b'], scale });

describe('client sprites: looks and palettes', () => {
  it('resolves bases and aliases to archetypes, unknowns to human', () => {
    expect(resolveArchetype('elf')).toBe('elf');
    expect(resolveArchetype('beast')).toBe('beastkin');
    expect(resolveArchetype('Skeleton')).toBe('undead');
    expect(resolveArchetype('crow')).toBe('bird');
    expect(resolveArchetype('???')).toBe('human');
    expect(resolveArchetype(undefined)).toBe('human');
  });

  it('maps archetypes to the body templates of art_pipeline.md 3.2', () => {
    expect(bodyTemplate('human')).toBe('H');
    expect(bodyTemplate('dwarf')).toBe('HS');
    expect(bodyTemplate('halfling')).toBe('HS');
    expect(bodyTemplate('golem')).toBe('HL');
    expect(bodyTemplate('wolf')).toBe('Q');
    expect(bodyTemplate('bird')).toBe('F');
    expect(bodyTemplate('object')).toBe('O');
  });

  it('keys looks by every input that changes pixels', () => {
    const a = look('human');
    expect(look('human').key).toBe(a.key);
    expect(look('elf').key).not.toBe(a.key);
    expect(look('human', 2).key).not.toBe(a.key);
    const recolored = lookFromAppearance({ base: 'human', colors: ['#ff0000'] });
    expect(recolored.key).not.toBe(a.key);
  });

  it('falls back to defaults for missing or malformed colours and clamps scale', () => {
    const l = lookFromAppearance({ base: 'human', colors: ['nope'] });
    expect(l.primary).toBe(0x3b4a6b);
    expect(parseHex('#abc', 0)).toBe(0xaabbcc);
    expect(toHex(0x0a0b0c)).toBe('#0a0b0c');
    expect(clampScale(undefined)).toBe(1);
    expect(clampScale(100)).toBe(4);
    expect(clampScale(0.01)).toBe(0.5);
    expect(clampScale(1.3)).toBe(1.25);
  });

  it('builds ramps whose outline steps are dark but never pure black', () => {
    for (const base of [0x000000, 0x2b2b2b, 0xf1c9a5, 0x3b4a6b, 0xffffff]) {
      const r = shadeRamp(base);
      expect(r).toHaveLength(6);
      expect(r[4]).not.toBe(0x000000);
      expect(r[5]).not.toBe(0x000000);
      // light steps are lighter than the base, outline steps darker than the shadow
      if (base !== 0xffffff) expect(luminance(r[0] as number)).toBeGreaterThan(luminance(base));
      if (base !== 0x000000) {
        expect(luminance(r[5] as number)).toBeLessThan(luminance(r[3] as number) + 1e-9);
      }
    }
  });
});

describe('client sprites: frame generation', () => {
  it('is deterministic: same look, animation, direction and frame give the same pixels', () => {
    for (const arch of ARCHETYPES) {
      const a = generateFrame(look(arch), 'walk', 'down', 2);
      const b = generateFrame(look(arch), 'walk', 'down', 2);
      expect(matrixHash(a.matrix)).toBe(matrixHash(b.matrix));
    }
  });

  it('produces frames of the template size with the anchor inside', () => {
    const cases: [string, number, number][] = [
      ['human', 1, 48],
      ['dwarf', 1, 48],
      ['golem', 1, 64],
      ['wolf', 1, 48],
      ['object', 1, 32],
      ['human', 2, 96],
      ['golem', 1.5, 96],
    ];
    for (const [arch, scale, size] of cases) {
      const l = look(arch, scale);
      const f = generateFrame(l, 'idle', 'down', 0);
      expect(f.matrix.w).toBe(size);
      expect(f.matrix.h).toBe(size);
      expect(f.matrix.rgba.length).toBe(size * size * 4);
      expect(frameSize(l)).toMatchObject({ w: size, h: size });
      expect(f.anchorX).toBe(size / 2);
      expect(f.anchorY).toBeGreaterThan(size * 0.8);
      expect(f.anchorY).toBeLessThan(size);
    }
  });

  it('draws a visible body for every archetype, procedural pose, direction and frame', () => {
    for (const arch of ARCHETYPES) {
      const l = look(arch);
      for (const anim of PROCEDURAL_POSES) {
        for (const dir of DIRS) {
          for (let f = 0; f < frameCountFor(l, anim); f++) {
            const fr = generateFrame(l, anim, dir, f);
            expect(opaqueCount(fr.matrix), `${arch} ${anim} ${dir} ${f}`).toBeGreaterThan(20);
            const b = opaqueBounds(fr.matrix);
            expect(b, `${arch} ${anim} ${dir} ${f}`).not.toBeNull();
            // nothing is clipped at the frame border
            expect(b?.x0).toBeGreaterThan(0);
            expect(b?.x1).toBeLessThan(fr.matrix.w - 1);
            expect(b?.y0).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('keeps standing humanoids near the art spec height (body about 28 to 30 px)', () => {
    const f = generateFrame(look('human'), 'idle', 'down', 0);
    expect(f.height).toBeGreaterThanOrEqual(27);
    expect(f.height).toBeLessThanOrEqual(34);
    const dwarf = generateFrame(look('dwarf'), 'idle', 'down', 0);
    expect(dwarf.height).toBeLessThan(f.height);
    const big = generateFrame(look('human', 2), 'idle', 'down', 0);
    expect(big.height).toBeGreaterThan(f.height * 1.7);
  });

  it('mirrors right-facing frames for left-facing ones', () => {
    for (const arch of ['human', 'wolf', 'bird'] as const) {
      const r = generateFrame(look(arch), 'walk', 'right', 1);
      const l = generateFrame(look(arch), 'walk', 'left', 1);
      expect(matrixHash(l.matrix)).toBe(matrixHash(mirrorX(r.matrix)));
    }
  });

  it('never uses pure black and outlines with the deepened neighbour colour', () => {
    const f = generateFrame(look('human'), 'idle', 'down', 0);
    let opaque = 0;
    for (let y = 0; y < f.matrix.h; y++) {
      for (let x = 0; x < f.matrix.w; x++) {
        if (getAlpha(f.matrix, x, y) === 0) continue;
        opaque++;
        expect(getPixel(f.matrix, x, y)).not.toBe(0x000000);
      }
    }
    expect(opaque).toBeGreaterThan(100);
  });

  it('distinguishes directions, animations and the hit flash', () => {
    const l = look('human');
    const h = (anim: (typeof ANIMS)[number], dir: Dir, f: number) =>
      matrixHash(generateFrame(l, anim, dir, f).matrix);
    expect(h('idle', 'down', 0)).not.toBe(h('idle', 'up', 0));
    expect(h('idle', 'down', 0)).not.toBe(h('idle', 'right', 0));
    expect(h('walk', 'right', 0)).not.toBe(h('walk', 'right', 3));
    expect(h('attack', 'right', 1)).not.toBe(h('idle', 'right', 0));
    expect(h('hit', 'down', 0)).not.toBe(h('hit', 'down', 1));
    expect(h('death', 'down', 3)).not.toBe(h('idle', 'down', 0));
  });

  it('lifts flyers above their shadow and gives divine beings a glow', () => {
    expect(generateFrame(look('bird'), 'idle', 'down', 0).lift).toBeGreaterThan(0);
    expect(generateFrame(look('bird'), 'death', 'down', 3).lift).toBe(0);
    expect(generateFrame(look('goddess'), 'idle', 'down', 0).glow).toBeDefined();
    expect(generateFrame(look('spirit'), 'idle', 'down', 0).glow).toBeDefined();
    expect(generateFrame(look('human'), 'idle', 'down', 0).glow).toBeUndefined();
  });

  it('clamps out-of-range frame indices and keys frames uniquely', () => {
    const l = look('human');
    const last = generateFrame(l, 'death', 'down', ANIM_SPECS.death.frames - 1);
    const over = generateFrame(l, 'death', 'down', 99);
    expect(matrixHash(over.matrix)).toBe(matrixHash(last.matrix));
    expect(frameCountFor(look('object'), 'walk')).toBe(1);
    const keys = new Set<string>();
    for (const anim of ANIMS) for (const dir of DIRS) keys.add(spriteKey(l, anim, dir, 0));
    expect(keys.size).toBe(ANIMS.length * DIRS.length);
  });
});

describe('client sprites: animation timing', () => {
  it('quantises world facing (atan2 with +y south) to four directions', () => {
    expect(dirFromFacing(0)).toBe('right');
    expect(dirFromFacing(Math.PI / 2)).toBe('down');
    expect(dirFromFacing(-Math.PI / 2)).toBe('up');
    expect(dirFromFacing(Math.PI)).toBe('left');
    expect(dirFromFacing(-Math.PI)).toBe('left');
    expect(dirFromFacing(Math.PI / 4 + 0.01)).toBe('down');
    expect(dirFromFacing(2 * Math.PI)).toBe('right');
  });

  it('loops looping animations and holds the last frame of one-shots', () => {
    expect(frameAt('idle', 0)).toBe(0);
    expect(frameAt('idle', 230)).toBe(1);
    expect(frameAt('idle', 880 + 10)).toBe(0);
    expect(frameAt('death', 100000)).toBe(ANIM_SPECS.death.frames - 1);
    expect(frameAt('attack', 85)).toBe(1);
  });
});

describe('client sprites: the action strip vocabulary (art_pipeline.md 3.3 and 3.4)', () => {
  const templates = (templatesJson as unknown as { templates: Record<string, TemplateLike> })
    .templates;
  const stripTemplates = Object.keys(templates)
    .filter((t) => t.startsWith('chr_') && t !== 'chr_turnaround')
    .map((t) => t.slice(4));

  it('lists the 13 mannequin strips plus the two main-character strips, one per chr template', () => {
    expect(ACTION_STRIPS).toHaveLength(13);
    expect([...ACTION_STRIPS, ...MAIN_ONLY_STRIPS].sort()).toEqual([...stripTemplates].sort());
    expect(new Set(ANIMS.map((a) => ANIM_SPECS[a].strip))).toEqual(
      new Set([...ACTION_STRIPS, ...MAIN_ONLY_STRIPS]),
    );
  });

  it('names every animation as its strip does, with the strip frame count and timing', () => {
    for (const anim of ANIMS) {
      const spec = ANIM_SPECS[anim];
      const tpl = `chr_${spec.strip}`;
      const imp = importSpecFor(tpl, templates[tpl] as TemplateLike, `art_chr_test_${spec.strip}`);
      const cells = frameCells(imp).filter(
        (c) => c.def.anim === spec.sheetAnim && (c.def.dir === 'down' || imp.dirAxis === 'none'),
      );
      expect(cells.length, anim).toBe(spec.frames);
      const ms = cells.sort((a, b) => a.def.i - b.def.i).map((c) => c.def.ms);
      // distance-driven cycles (walk, run, ride) carry no duration in the strip, and revive
      // plays the death frames backwards at its own pace (3.4)
      if (!spec.reverse && ms.every((m) => m !== null)) expect(spec.frameMs, anim).toEqual(ms);
      expect(imp.anims.find((a) => a.name === spec.sheetAnim)?.loop ?? false, anim).toBe(
        spec.loop && !spec.reverse,
      );
    }
  });

  it('keeps the five first-round poses as they were and borrows them for the rest', () => {
    for (const pose of PROCEDURAL_POSES) {
      for (let f = 0; f < ANIM_SPECS[pose].frames; f++)
        expect(proceduralPose(pose, f)).toEqual({ pose, frame: f });
    }
    expect(proceduralPose('run', 5)).toEqual({ pose: 'walk', frame: 5 });
    expect(proceduralPose('melee', 2)).toEqual({ pose: 'attack', frame: 2 });
    expect(proceduralPose('thrust', 4)).toEqual({ pose: 'attack', frame: 3 });
    expect(proceduralPose('block', 1)).toEqual({ pose: 'hit', frame: 1 });
    expect(proceduralPose('revive', 0)).toEqual({ pose: 'death', frame: 3 });
    expect(proceduralPose('sit', 1)).toEqual({ pose: 'idle', frame: 1 });
    expect(stripFrame('revive', 1)).toBe(2);
    expect(stripFrame('attack', 9)).toBe(3);
    // attack is the generic cue: the melee strip's frames and timing
    expect(ANIM_SPECS.attack).toMatchObject({ strip: 'attack_melee', sheetAnim: 'melee' });
    expect(ANIM_SPECS.attack.frameMs).toEqual(ANIM_SPECS.melee.frameMs);
  });

  it('draws every animation with the pixels of the pose it borrows', () => {
    for (const arch of ['human', 'wolf', 'spirit', 'object'] as const) {
      const l = look(arch);
      for (const anim of ANIMS) {
        for (let f = 0; f < frameCountFor(l, anim); f++) {
          const p = proceduralPose(anim, f);
          const own = generateFrame(l, anim, 'right', f);
          const borrowed = generateFrame(l, p.pose, 'right', arch === 'object' ? 0 : p.frame);
          if (anim === 'hit' || p.pose !== 'hit' || p.frame !== 0) {
            expect(matrixHash(own.matrix), `${arch} ${anim} ${f}`).toBe(
              matrixHash(borrowed.matrix),
            );
          } else {
            // block and dodge borrow the hit pose without the hit flash
            expect(matrixHash(own.matrix)).not.toBe(matrixHash(borrowed.matrix));
          }
        }
      }
    }
  });
});

describe('client sprites: looks by art body (art_pipeline.md 3.2 and 3.8)', () => {
  const colors = ['#3b4a6b', '#c9b38a', '#f1c9a5', '#2b2b2b'];
  const monster = (base: string, ref = 'test_mob') =>
    lookFromEntity({ appearance: { base, colors, scale: 1.25 }, kind: 'monster', ref });

  it('maps bases to art bodies, by kind where it matters', () => {
    expect(bodyOf('rat', 'monster')).toBe('small');
    expect(bodyOf('wolf', 'monster')).toBe('medium');
    expect(bodyOf('beast', 'monster')).toBe('medium');
    expect(bodyOf('beast', 'npc')).toBe('h');
    expect(bodyOf('bear', 'monster')).toBe('large');
    expect(bodyOf('spider', 'monster')).toBe('multileg');
    expect(bodyOf('leech', 'monster')).toBe('serpentine');
    expect(bodyOf('drake', 'monster')).toBe('drake');
    expect(bodyOf('bird', 'monster')).toBe('flying');
    expect(bodyOf('slime', 'monster')).toBe('amorphous');
    expect(bodyOf('undead', 'monster')).toBe('medium');
    expect(bodyOf('undead', 'npc')).toBe('h');
    expect(bodyOf('dwarf', 'npc')).toBe('hs');
    expect(bodyOf('ogre', 'monster')).toBe('hb');
    expect(bodyOf('orc', 'npc')).toBe('h');
    expect(bodyOf('imp', 'monster')).toBe('small');
    expect(resolveArchetype('imp')).toBe('demon');
    expect(resolveArchetype('ogre')).toBe('demon');
    expect(bodyOf('object', 'object')).toBe('object');
    expect(bodyOf('human', 'monster')).toBe('h');
  });

  it('draws every creature body without its own drawing as the first-round four-legged creature', () => {
    const generic = monster('beast');
    for (const base of [
      'rat',
      'boar',
      'bear',
      'spider',
      'centipede',
      'beetle',
      'worm',
      'leech',
      'drake',
    ]) {
      const l = monster(base);
      expect(CREATURE_BODIES.has(l.body), base).toBe(true);
      expect(l.archetype, base).toBe('wolf');
      expect(l.key, base).toBe(generic.key);
      expect(matrixHash(generateFrame(l, 'walk', 'right', 3).matrix)).toBe(
        matrixHash(generateFrame(generic, 'walk', 'right', 3).matrix),
      );
    }
    // the elemental and the shade keep their spirit placeholder on bigger creature sheets
    expect([monster('elemental').archetype, monster('elemental').body]).toEqual([
      'spirit',
      'large',
    ]);
    expect([monster('shade').archetype, monster('shade').body]).toEqual(['spirit', 'medium']);
  });

  it('gives creatures their content id as art subject and people their art references', () => {
    expect(monster('rat', 'dian_rat').art).toEqual({ subject: 'dian_rat' });
    const bandit = lookFromEntity({
      appearance: { base: 'human', colors },
      kind: 'monster',
      ref: 'b',
    });
    expect(bandit.body).toBe('h');
    expect(bandit.art).toBeUndefined();
    const yeyu = lookFromEntity({
      appearance: {
        base: 'human',
        colors,
        sheet: 'art_chr_yeyu',
        portrait: 'art_por_yeyu',
        bust: 'art_bust_yeyu',
        variants: { 'flag.x': { portrait: 'art_por_yeyu_crowned' } },
      },
      kind: 'companion',
      ref: 'yeyu',
    });
    expect(yeyu.art).toEqual({
      sheet: 'art_chr_yeyu',
      portrait: 'art_por_yeyu',
      bust: 'art_bust_yeyu',
      variants: { 'flag.x': { portrait: 'art_por_yeyu_crowned' } },
    });
    // art references never touch the placeholder key
    expect(yeyu.key).toBe(lookFromAppearance({ base: 'human', colors }).key);
    const doll = lookFromAppearance({
      base: 'dwarf',
      colors,
      doll: { body: 'hs', outfit: 'art_doll_gear_garb' },
    });
    expect(doll.art?.doll?.body).toBe('hs');
    expect(doll.body).toBe('hs');
  });

  it('writes every monster base so its art body matches its prompt spec template', () => {
    const specOf = new Map<string, string>();
    for (const it of (specMonsters as unknown as { items: { ref?: string; template: string }[] })
      .items) {
      if (it.ref && it.template.startsWith('mon_') && it.template !== 'mon_turnaround')
        specOf.set(it.ref, it.template);
    }
    const mons = monstersJson as unknown as { id: string; appearance: { base: string } }[];
    let checked = 0;
    for (const m of mons) {
      expect(m.appearance.base, m.id).not.toBe('beast');
      const tpl = specOf.get(ART_ALIASES[m.id] ?? m.id);
      if (!tpl) continue;
      expect(BODY_TEMPLATE[bodyOf(m.appearance.base, 'monster')], m.id).toBe(tpl);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });
});

describe('client sprites: animation names are total', () => {
  it('has a spec with one duration per frame for every name', () => {
    const names: AnimName[] = [...ANIMS];
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(36);
    for (const a of names) expect(ANIM_SPECS[a].frameMs, a).toHaveLength(ANIM_SPECS[a].frames);
    expect(frameAt('revive', 10000)).toBe(3);
    expect(frameAt('sit', 450 + 10)).toBe(1);
  });
});

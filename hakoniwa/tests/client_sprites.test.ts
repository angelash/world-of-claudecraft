import { describe, expect, it } from 'vitest';
import {
  ANIM_SPECS,
  ANIMS,
  DIRS,
  type Dir,
  dirFromFacing,
  frameAt,
} from '../src/client/sprites/anim_spec';
import { frameCountFor, frameSize, generateFrame, spriteKey } from '../src/client/sprites/generate';
import {
  ARCHETYPES,
  bodyTemplate,
  clampScale,
  lookFromAppearance,
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

  it('draws a visible body for every archetype, animation, direction and frame', () => {
    for (const arch of ARCHETYPES) {
      const l = look(arch);
      for (const anim of ANIMS) {
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

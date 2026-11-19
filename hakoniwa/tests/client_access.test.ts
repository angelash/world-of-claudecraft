// PK-M1-23 accessibility (ux_and_onboarding.md 4.7, 18): the `ui_set_access` page model and its
// patches, the page writes of the accessibility settings (colour mode, text size, larger
// dialogue, calm), the colour-vision token tables against the 18.2 contrast floor, the caption
// style the caption painter draws with, the written cutscene sounds' captions, and the gamepad
// audio unlock. Pure cores only.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accessApply,
  accessWrites,
  BIG_DIALOGUE_CLASS,
  BLUE_YELLOW_TOKENS,
  CALM_CLASS,
  contrastRatio,
  HIGH_CONTRAST_BG,
  modeTokens,
  PANEL_BG,
  RED_GREEN_TOKENS,
  STANDARD_TOKENS,
  TOKEN_SHAPES,
  type TokenId,
  tokenVar,
} from '../src/client/app/access_apply_model';
import {
  COLOR_MODES,
  defaultSettings,
  normalizeSettings,
  type SyncSettings,
} from '../src/client/app/settings_schema';
import {
  CAPTION_MIN_PX,
  CAPTION_PX,
  CAPTION_Z_SCENE,
  captionPlace,
  captionStyle,
  resolveAudioSettings,
} from '../src/client/audio/audio_settings';
import { CINE_CAPTIONS, cineCaption } from '../src/client/audio/cine_captions';
import { PadAudioUnlock } from '../src/client/audio/pad_unlock';
import { inRingGap, RING_COLORS, ringColor } from '../src/client/hd2d/ground_marks';
import { dotColor } from '../src/client/hud/minimap_model';
import {
  activePalette,
  BLUE_YELLOW_PALETTE,
  paletteFor,
  paletteVersion,
  RED_GREEN_PALETTE,
  STANDARD_PALETTE,
  setColourMode,
  setWorldCalm,
  worldCalm,
} from '../src/client/render/palette_modes';
import {
  ACCESS_GROUPS,
  type AccessChoiceRow,
  accessDefaultsPatch,
  accessPageModel,
  accessPatch,
  fieldKey,
} from '../src/client/windows/settings/access_model';
import { SOURCE_TABLE } from '../src/shared_ui/i18n';

const sync = (): SyncSettings => defaultSettings('sync');

describe('ui_set_access page model (4.7)', () => {
  it('lists the four groups of 4.7 in order with every row of 18', () => {
    const m = accessPageModel(sync());
    expect(m.groups.map((g) => g.id)).toEqual([...ACCESS_GROUPS]);
    const fields = m.groups.map((g) => g.rows.map((r) => r.field));
    expect(fields).toEqual([
      ['colorMode', 'textScale', 'largeDialogue'],
      ['subtitles', 'captionSize', 'captionBackdrop', 'captionPosition', 'captionColors'],
      ['holdToToggle'],
      ['reduceFlashing'],
    ]);
    const color = m.groups[0]?.rows[0] as AccessChoiceRow;
    expect(color.options.map((o) => o.value)).toEqual([...COLOR_MODES]);
    expect(color.value).toBe('standard');
  });

  it('every row label, option and note is a source-table text (no key shown as itself)', () => {
    const m = accessPageModel({
      ...sync(),
      accessibility: { ...sync().accessibility, colorMode: 'high_contrast' },
    });
    const texts: string[] = [];
    for (const g of m.groups) {
      texts.push(g.title, g.note);
      for (const r of g.rows) {
        texts.push(r.label, r.note);
        if (r.kind === 'choice') texts.push(...r.options.map((o) => o.label));
      }
    }
    for (const s of texts) expect(s.startsWith('ui.'), s).toBe(false);
    // the high-contrast note on the backdrop row shows only in that mode
    const backdrop = m.groups[1]?.rows[2] as AccessChoiceRow;
    expect(backdrop.note).toBe(SOURCE_TABLE['ui.set.access.caption_backdrop_hc']);
    const std = accessPageModel(sync()).groups[1]?.rows[2] as AccessChoiceRow;
    expect(std.note).toBe('');
  });

  it('greys the caption style while captions are off, and only then', () => {
    const off = accessPageModel({ ...sync(), subtitles: 'off' }).groups[1]?.rows ?? [];
    expect(off.map((r) => r.disabled)).toEqual([false, true, true, true, true]);
    const on = accessPageModel(sync()).groups[1]?.rows ?? [];
    expect(on.every((r) => !r.disabled)).toBe(true);
  });

  it('patches one field at a time and refuses values the schema would refuse', () => {
    const s = sync();
    expect(accessPatch(s, 'colorMode', 'red_green')).toEqual({
      accessibility: { ...s.accessibility, colorMode: 'red_green' },
    });
    expect(accessPatch(s, 'textScale', '1.3')).toEqual({
      accessibility: { ...s.accessibility, textScale: 1.3 },
    });
    expect(accessPatch(s, 'captionBackdrop', '50')).toEqual({
      accessibility: { ...s.accessibility, captionBackdrop: 50 },
    });
    expect(accessPatch(s, 'subtitles', 'all')).toEqual({ subtitles: 'all' });
    expect(accessPatch(s, 'holdToToggle', true)).toEqual({
      accessibility: { ...s.accessibility, holdToToggle: true },
    });
    expect(accessPatch(s, 'colorMode', 'sepia')).toBeNull();
    expect(accessPatch(s, 'textScale', '2')).toBeNull();
    expect(accessPatch(s, 'captionBackdrop', '60')).toBeNull();
    expect(accessPatch(s, 'subtitles', 'some')).toBeNull();
    expect(accessPatch(s, 'holdToToggle', 'yes')).toBeNull();
    expect(accessPatch(s, 'captionPosition', true)).toBeNull();
  });

  it('every patch survives the settings schema unchanged', () => {
    const s = sync();
    const patch = accessPatch(s, 'captionPosition', 'top');
    const n = normalizeSettings('sync', { ...s, ...patch });
    expect(n.issues).toEqual([]);
    expect(n.values.accessibility.captionPosition).toBe('top');
  });

  it('restores every accessibility field and the caption mode to their defaults', () => {
    const d = defaultSettings('sync');
    expect(accessDefaultsPatch()).toEqual({
      accessibility: d.accessibility,
      subtitles: 'important',
    });
    expect(d.accessibility).toEqual({
      colorMode: 'standard',
      textScale: 1,
      largeDialogue: false,
      reduceFlashing: 'system',
      holdToToggle: false,
      captionSize: 'standard',
      captionBackdrop: 75,
      captionPosition: 'bottom',
      captionColors: true,
    });
  });

  it('reads a stored part without the caption style fields as the defaults', () => {
    const old = {
      version: 1,
      accessibility: {
        colorMode: 'red_green',
        textScale: 1.15,
        largeDialogue: true,
        reduceFlashing: 'on',
        holdToToggle: true,
      },
    };
    const n = normalizeSettings('sync', old);
    expect(n.issues).toEqual([]);
    expect(n.values.accessibility).toMatchObject({
      colorMode: 'red_green',
      captionSize: 'standard',
      captionBackdrop: 75,
      captionPosition: 'bottom',
      captionColors: true,
    });
  });

  it('names its fields by the snake-case key segment', () => {
    expect(fieldKey('captionBackdrop')).toBe('caption_backdrop');
    expect(fieldKey('subtitles')).toBe('subtitles');
  });
});

describe('accessibility page writes (18.2, 18.3, 18.8)', () => {
  it('writes the colour mode, the text size step and the caption mode as attributes', () => {
    const a = {
      ...sync().accessibility,
      colorMode: 'blue_yellow' as const,
      textScale: 1.3 as const,
    };
    const w = accessWrites(accessApply(a, 'all', false));
    expect(w.attrs).toEqual({
      'data-color-mode': 'blue_yellow',
      'data-text-size': 'xlarge',
      'data-captions': 'all',
    });
    expect(w.vars['--hk-text-scale']).toBe('1.3');
    expect(w.vars['--hk-dlg-scale']).toBe('1.3');
  });

  it('larger dialogue text adds one step on top of the text size', () => {
    const a = { ...sync().accessibility, largeDialogue: true, textScale: 1.15 as const };
    const v = accessApply(a, 'important', false);
    expect(v.dialogueScale).toBeCloseTo(1.3225, 3);
    expect(accessWrites(v).classes[BIG_DIALOGUE_CLASS]).toBe(true);
  });

  it('calm follows the setting, and the system preference only under "system"', () => {
    const base = sync().accessibility;
    const calm = (flash: 'system' | 'on' | 'off', sys: boolean) =>
      accessWrites(accessApply({ ...base, reduceFlashing: flash }, 'important', sys)).classes[
        CALM_CLASS
      ];
    expect([
      calm('system', false),
      calm('system', true),
      calm('on', false),
      calm('off', true),
    ]).toEqual([false, true, true, false]);
  });
});

describe('colour-vision tokens (18.2)', () => {
  const ids = Object.keys(STANDARD_TOKENS) as TokenId[];

  it('every token keeps a shape, and the modes replace exactly the 18.2 tokens', () => {
    for (const id of ids) expect(TOKEN_SHAPES[id], id).toBeTruthy();
    expect(Object.keys(RED_GREEN_TOKENS).sort()).toEqual(
      ['q.2', 'q.4', 'rel.friend', 'rel.hostile', 'warn.ally', 'warn.enemy'].sort(),
    );
    expect(Object.keys(BLUE_YELLOW_TOKENS).sort()).toEqual(['q.3', 'rel.neutral', 'warn.ally']);
    expect(modeTokens('red_green')['rel.hostile']).toBe('#d94fc1');
    expect(modeTokens('high_contrast')).toEqual(STANDARD_TOKENS);
  });

  it('every token of every mode meets 4.5:1 on the night panel and on the high-contrast panel', () => {
    for (const mode of COLOR_MODES) {
      const table = modeTokens(mode);
      for (const id of ids) {
        const fg = table[id];
        const bg = mode === 'high_contrast' ? HIGH_CONTRAST_BG : PANEL_BG;
        expect(contrastRatio(fg, bg), `${mode} ${id} ${fg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the stylesheet declares every token variable with the table value of each mode', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'client', 'access.css'), 'utf8');
    const block = (selector: string): string => {
      const i = css.indexOf(`${selector} {`);
      expect(i, selector).toBeGreaterThanOrEqual(0);
      return css.slice(i, css.indexOf('}', i));
    };
    const root = block(':root');
    for (const id of ids) {
      expect(root, id).toContain(`${tokenVar(id)}: ${STANDARD_TOKENS[id]};`);
    }
    const rg = block(':root[data-color-mode="red_green"]');
    for (const [id, v] of Object.entries(RED_GREEN_TOKENS))
      expect(rg).toContain(`${tokenVar(id as TokenId)}: ${v};`);
    const by = block(':root[data-color-mode="blue_yellow"]');
    for (const [id, v] of Object.entries(BLUE_YELLOW_TOKENS))
      expect(by).toContain(`${tokenVar(id as TokenId)}: ${v};`);
  });

  it('measures contrast the WCAG way', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(Number.isNaN(contrastRatio('white', '#000000'))).toBe(true);
  });
});

describe('caption style (18.4)', () => {
  it('defaults to the standard size, 75% backdrop, bottom, coloured important lines', () => {
    expect(captionStyle(undefined)).toEqual({
      fontPx: CAPTION_PX.standard,
      backdrop: 0.75,
      position: 'bottom',
      colors: true,
      highContrast: false,
    });
  });

  it('scales with the text size, never under the minimum, and high contrast is opaque', () => {
    expect(captionStyle({ captionSize: 'xlarge', textScale: 1.3 }).fontPx).toBe(29);
    expect(captionStyle({ captionSize: 'small', textScale: 0.9 }).fontPx).toBe(CAPTION_MIN_PX);
    const hc = captionStyle({ colorMode: 'high_contrast', captionBackdrop: 0 });
    expect([hc.backdrop, hc.highContrast]).toEqual([1, true]);
    expect(captionStyle({ captionBackdrop: 0, captionPosition: 'top' })).toMatchObject({
      backdrop: 0,
      position: 'top',
    });
    expect(captionStyle({ captionSize: 'huge', captionPosition: 'left' })).toMatchObject({
      fontPx: CAPTION_PX.standard,
      position: 'bottom',
    });
  });

  it('reaches the audio runtime settings from the sync part', () => {
    const s = sync();
    const r = resolveAudioSettings(
      { ...s, accessibility: { ...s.accessibility, captionSize: 'large', captionColors: false } },
      { focused: true, systemReducedMotion: false },
    );
    expect(r.captionStyle).toMatchObject({ fontPx: CAPTION_PX.large, colors: false });
  });
});

describe('cutscene sound captions (catalog_cutscenes.md 13.8)', () => {
  const scenes = join(__dirname, '..', 'data', 'scenes');
  const used = new Set<string>();
  for (const f of ['prologue.json', 'act1.json']) {
    for (const m of readFileSync(join(scenes, f), 'utf8').matchAll(/"(sfx_[a-z0-9_]+)"/g))
      used.add(m[1] as string);
  }

  it('gives a caption to every written sound of the prologue and act 1 scenes', () => {
    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter((id) => !CINE_CAPTIONS[id]);
    expect(missing).toEqual([]);
  });

  it('every caption has its text in the interface table', () => {
    for (const id of Object.keys(CINE_CAPTIONS)) {
      expect(SOURCE_TABLE[`ui.ovl.caption.${id}`], id).toBeTruthy();
    }
  });

  it('hands the audio the caption key and level, nothing for an unknown sound', () => {
    expect(cineCaption('sfx_cin_a1_alarm_bell')).toEqual({
      caption: 'audio.cap.sfx_cin_a1_alarm_bell',
      captionLevel: 'important',
    });
    expect(cineCaption('sfx_unknown')).toBeNull();
  });

  it('the scene tables list no scene file this test does not read', () => {
    // act 2 to 5 scenes carry no written sound yet: when one does, it joins this check
    const others = readdirSync(scenes).filter((f) => !['prologue.json', 'act1.json'].includes(f));
    for (const f of others) {
      expect(/"sfx_[a-z0-9_]+"/.test(readFileSync(join(scenes, f), 'utf8')), f).toBe(false);
    }
  });
});

describe('gamepad audio unlock (18.5)', () => {
  const pad = (...down: number[]) => ({
    id: 'pad',
    buttons: Array.from({ length: 17 }, (_, i) => (down.includes(i) ? 1 : 0)),
    axes: [0, 0, 0, 0],
  });

  it('asks on the first fresh press, not on a button held before the page saw the pad', () => {
    const u = new PadAudioUnlock();
    expect(u.press(pad(0), false)).toBe(false); // held since before: recorded only
    expect(u.press(pad(0), false)).toBe(false);
    expect(u.press(pad(), false)).toBe(false);
    expect(u.press(pad(1), false)).toBe(true);
  });

  it('asks again on later presses until the output runs, then never', () => {
    const u = new PadAudioUnlock();
    u.press(pad(), false);
    expect(u.press(pad(3), false)).toBe(true);
    expect(u.press(pad(), false)).toBe(false);
    expect(u.press(pad(3), false)).toBe(true);
    expect(u.press(pad(), true)).toBe(false);
    expect(u.press(pad(5), false)).toBe(false);
  });

  it('a trigger counts past half travel; no pad clears what was held', () => {
    const u = new PadAudioUnlock();
    u.press(pad(), false);
    const half = { id: 'pad', buttons: [0, 0, 0, 0, 0, 0, 0.4], axes: [] };
    expect(u.press(half, false)).toBe(false);
    const full = { id: 'pad', buttons: [0, 0, 0, 0, 0, 0, 0.9], axes: [] };
    expect(u.press(full, false)).toBe(true);
    expect(u.press(null, false)).toBe(false);
    u.settle();
    expect(u.press(pad(2), false)).toBe(false);
  });
});

describe('world palette by colour mode (18.2)', () => {
  it('the standard palette keeps the colours the painters had', () => {
    expect(STANDARD_PALETTE.rings).toEqual(RING_COLORS);
    expect(paletteFor('high_contrast').rings).toEqual(STANDARD_PALETTE.rings);
  });

  it('red-green and blue-yellow use the 18.2 hues in the world too', () => {
    expect(RED_GREEN_PALETTE.rings.hostile).toBe(0xd94fc1);
    expect(RED_GREEN_PALETTE.rings.friendly).toBe(0x3fb6e8);
    expect(RED_GREEN_PALETTE.warnings.hostile.edge).toBe('#f0a030');
    expect(RED_GREEN_PALETTE.warnings.friendly.edge).toBe('#4f7fe8');
    expect(RED_GREEN_PALETTE.dots.hostile).toBe('#d94fc1');
    expect(BLUE_YELLOW_PALETTE.rings.neutral).toBe(0xc8c8c8);
    expect(BLUE_YELLOW_PALETTE.warnings.friendly.edge).toBe('#30c8a0');
    // the attacker's ring and name stay apart from the hostile hue in every mode
    for (const p of [STANDARD_PALETTE, RED_GREEN_PALETTE, BLUE_YELLOW_PALETTE]) {
      expect(p.rings.threat).not.toBe(p.rings.hostile);
      expect(p.names.threat).not.toBe(p.names.hostile);
      expect(p.warnings.hostile.edge).not.toBe(p.warnings.friendly.edge);
    }
  });

  it('the painters read the active palette; a mode change bumps the cache version', () => {
    setColourMode('standard');
    const v0 = paletteVersion();
    expect(setColourMode('red_green')).toBe(true);
    expect(setColourMode('red_green')).toBe(false);
    expect(paletteVersion()).toBe(v0 + 1);
    expect(ringColor('hostile')).toBe(0xd94fc1);
    expect(dotColor('friendly')).toBe('#3fb6e8');
    expect(activePalette().names.threat).toBe(RED_GREEN_PALETTE.names.threat);
    // the shape cue does not depend on the colour (the hostile ring keeps its gaps)
    expect(inRingGap('hostile', Math.PI / 4)).toBe(true);
    setColourMode('standard');
    expect(ringColor('hostile')).toBe(RING_COLORS.hostile);
  });

  it('every world colour of every mode stands out against the night ground (3:1 for graphics)', () => {
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    for (const p of [STANDARD_PALETTE, RED_GREEN_PALETTE, BLUE_YELLOW_PALETTE]) {
      for (const [k, c] of Object.entries(p.rings)) {
        expect(contrastRatio(hex(c), PANEL_BG), `${p.mode} ring ${k}`).toBeGreaterThanOrEqual(3);
      }
      for (const [k, c] of Object.entries(p.dots)) {
        expect(contrastRatio(c, '#101018'), `${p.mode} dot ${k}`).toBeGreaterThanOrEqual(3);
      }
      for (const [k, c] of Object.entries(p.names)) {
        expect(contrastRatio(c, '#101018'), `${p.mode} name ${k}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the calm switch reaches the world painters', () => {
    setWorldCalm(false);
    expect(setWorldCalm(true)).toBe(true);
    expect(worldCalm()).toBe(true);
    expect(setWorldCalm(true)).toBe(false);
    setWorldCalm(false);
    expect(worldCalm()).toBe(false);
  });

  it('the frame name colours read the relation tokens (the DOM side of 18.2)', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'client', 'access.css'), 'utf8');
    for (const [rel, token] of [
      ['self', 'self'],
      ['hostile', 'hostile'],
      ['friendly', 'friend'],
      ['neutral', 'neutral'],
    ]) {
      const i = css.indexOf(`.hk-frame.rel-${rel} .hk-frame-name {`);
      expect(i, rel).toBeGreaterThanOrEqual(0);
      expect(css.slice(i, css.indexOf('}', i))).toContain(`var(--hk-rel-${token})`);
    }
  });
});

describe('text size and calm stylesheet rules (18.3, 18.8)', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'access.css'), 'utf8');

  it('scales text one way only: no body font-size rule beside the zoom', () => {
    expect(css).not.toMatch(/body\s*\{[^}]*font-size/);
    for (const sel of [
      '.hk-hud-br',
      '.hk-hud-bc > :not(.hk-dlg2)',
      '.hk-bn',
      '.hk-window-title',
      '.hk-window-body',
      '.hk-wheel',
      '.hk-tut-card',
      '.hk-boot-card',
      '.hk-newgame-card',
    ]) {
      expect(css, sel).toContain(`:root:not([data-text-size="standard"]) ${sel}`);
    }
  });

  it('calm stops shakes and pulses by name, never every animation (fades stay)', () => {
    expect(css).not.toContain('hk-calm *');
    expect(css).toContain(':root.hk-calm .hk-cut.shake-1');
    expect(css).toContain(':root.hk-calm .hk-tut-glow');
    expect(css).not.toContain('hk-calm .hk-cut-fade');
  });
});

describe('caption placement (18.4, UX-6)', () => {
  it('the field keeps the captions under the notifications, clear of the bottom stack', () => {
    const bottom = captionPlace('bottom', 'field');
    expect([bottom.top, bottom.z]).toEqual(['', 0]);
    expect(bottom.bottom).toContain('212px');
    const top = captionPlace('top', 'field');
    expect(top.bottom).toBe('');
    // below the critical notification band that starts 84 px down
    expect(top.top).toContain('224px');
  });

  it('a conversation moves them to the notification band, which waits during talk', () => {
    const p = captionPlace('bottom', 'dialogue');
    expect([p.bottom, p.z]).toEqual(['', 0]);
    expect(p.top).toContain('84px');
  });

  it('a cutscene puts them at the top edge, over the cutscene layer, under the banner', () => {
    for (const pos of ['bottom', 'top'] as const) {
      const p = captionPlace(pos, 'scene');
      expect(p).toEqual({ top: '2vh', bottom: '', z: CAPTION_Z_SCENE });
    }
    expect(CAPTION_Z_SCENE).toBeGreaterThan(50);
    expect(CAPTION_Z_SCENE).toBeLessThan(60);
  });
});

// PK-M1-34: the goddess theme and the dream track of a scene (audio_direction.md 5.1 rules 4
// and 5; GameAudio.setDivine and setDream through src/client/hud/story/divine_audio.ts).
// The rule is a pure core: her theme while she speaks a divine line, nothing for a goddess whose
// theme waits for her name, the dream track on a dream reverb zone, nothing outside a scene.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AudioDirector, type DirectorInput } from '../src/client/audio/audio_director';
import {
  cueChanged,
  divineCue,
  divineLines,
  goddessTheme,
} from '../src/client/hud/story/divine_audio';
import { narrativeContent } from './narrative_harness';

const GODS = new Set(['eluen', 'merca', 'janu']);
const line = (speakerId: string, kind = 'divine') => ({ speakerId, kind });

function directorInput(over: Partial<DirectorInput>): DirectorInput {
  return {
    nowMs: 0,
    location: null,
    night: false,
    view: 'personal',
    cutscene: { music: null, silence: false },
    boss: null,
    combat: { hostiles: [], playerLevel: 1, wave: false },
    divine: null,
    dream: false,
    tension: { aware: false, sediment: 0, wild: false, flag: 0 },
    dialogueOpen: false,
    paused: false,
    combatMusic: true,
    ...over,
  };
}

describe('unscripted music during a cutscene', () => {
  it('hears a goddess or the dream when the scene specifies no track', () => {
    const d = new AudioDirector();
    let f = d.update(directorInput({ divine: { music: 'mus_god_eluen' }, dream: true }));
    expect(f.context).toBe('divine');
    expect(f.music.id).toBe('mus_god_eluen');
    expect(f.ducks).toContain('oracle_theme');
    f = d.update(directorInput({ dream: true }));
    expect(f.context).toBe('dream');
    expect(f.music.id).toBe('mus_cue_dream_door');
  });

  it('retains the priority of explicit scene music and written silence', () => {
    const d = new AudioDirector();
    const extra = { divine: { music: 'mus_god_eluen' }, dream: true };
    let f = d.update(
      directorInput({ ...extra, cutscene: { music: 'mus_written', silence: false, layers: 1 } }),
    );
    expect(f.context).toBe('cutscene');
    expect(f.music.id).toBe('mus_written');
    f = d.update(directorInput({ ...extra, cutscene: { music: null, silence: true } }));
    expect(f.context).toBe('cutscene');
    expect(f.music.id).toBeNull();
  });
});

describe('divine and dream cues', () => {
  it('hears an oracle from the loose dialogue model as well as a scene', () => {
    const lines = divineLines({
      cutscene: null,
      dialogue: { mode: 'loose', speakerId: 'merca', looseKind: 'divine' },
    });
    expect(lines).toEqual([line('merca')]);
    expect(divineCue({ lines: lines ?? [], goddesses: GODS, reverbZone: '' }).divine).toBe(
      'mus_god_merca',
    );
    expect(
      divineLines({
        cutscene: { lines: [line('eluen')] },
        dialogue: { mode: 'loose', speakerId: 'merca', looseKind: 'divine' },
      }),
    ).toEqual([line('eluen')]);
    expect(divineLines({ cutscene: null, dialogue: null })).toBeNull();
    expect(
      divineLines({
        cutscene: null,
        dialogue: { mode: 'talk', speakerId: 'merca', looseKind: '' },
      }),
    ).toBeNull();
  });

  it('her theme while she is the last to speak a divine line', () => {
    expect(
      divineCue({
        lines: [line('narrator', 'narrate'), line('merca')],
        goddesses: GODS,
        reverbZone: '',
      }),
    ).toEqual({ divine: 'mus_god_merca', dream: false });
    // she stops being the speaker: no theme (the engine holds it three seconds by itself)
    expect(
      divineCue({
        lines: [line('merca'), line('narrator', 'narrate')],
        goddesses: GODS,
        reverbZone: '',
      }).divine,
    ).toBeNull();
    // a goddess id that speaks a plain line, and a person with a divine kind: no theme
    expect(
      divineCue({ lines: [line('merca', 'say')], goddesses: GODS, reverbZone: '' }).divine,
    ).toBeNull();
    expect(
      divineCue({ lines: [line('cassian')], goddesses: GODS, reverbZone: '' }).divine,
    ).toBeNull();
  });

  it('a goddess whose theme waits for her name gives no divine cue, the dream still plays', () => {
    const cue = divineCue({
      lines: [line('janu')],
      goddesses: GODS,
      reverbZone: 'dream',
      muted: new Set(['janu']),
    });
    expect(cue).toEqual({ divine: null, dream: true });
    expect(divineCue({ lines: [line('janu')], goddesses: GODS, reverbZone: 'dream' }).divine).toBe(
      'mus_god_janu',
    );
  });

  it('nothing outside a scene; a change is reported only when a field differs', () => {
    expect(divineCue(null)).toEqual({ divine: null, dream: false });
    expect(cueChanged(null, { divine: null, dream: false })).toBe(true);
    expect(cueChanged({ divine: 'a', dream: false }, { divine: 'a', dream: false })).toBe(false);
    expect(cueChanged({ divine: 'a', dream: false }, { divine: 'a', dream: true })).toBe(true);
  });

  it('the dream doorway is a dream zone; every named goddess theme is a registered music id', () => {
    const content = narrativeContent() as unknown as {
      atlas_maps: { id: string; reverbZone?: string }[];
      goddesses: { id: string; hiddenName?: string }[];
    };
    const zones = content.atlas_maps.filter((m) => m.reverbZone === 'dream').map((m) => m.id);
    expect(zones).toContain('dream_doorway');
    // the audio direction names a theme per goddess (4.1, 5.1); the hidden one waits (act 6)
    const spec = readFileSync('assets/prompts/specs/audio_music.json', 'utf8');
    const ids = new Set(spec.match(/mus_god_[a-z_]+/g) ?? []);
    const named = content.goddesses.filter((x) => !x.hiddenName);
    expect(named.length).toBeGreaterThan(0);
    for (const g of named) expect(ids.has(goddessTheme(g.id)), g.id).toBe(true);
  });
});

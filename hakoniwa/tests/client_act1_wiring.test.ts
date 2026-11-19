// PK-M1-23 integration cores: when the act-1 windows open (ux_and_onboarding.md 1.5, UX-8), the
// level signals the onboarding reads (17.5), the save's client segment (17.8: guidance,
// tracking, evidence notes) through the slot header, and the difficulty in the save summary
// (3.5). Pure cores and the client saves over an in-memory container.

import { describe, expect, it } from 'vitest';
import {
  buildClientSegment,
  CLIENT_SEGMENT_MAX_CHARS,
  CLIENT_SEGMENT_VERSION,
  EvidenceNotes,
  NOTE_MAX_CHARS,
  NOTES_MAX,
  parseClientSegment,
} from '../src/client/app/client_segment';
import { createSandboxGame } from '../src/client/app/sandbox';
import {
  DUSK_HOUR,
  levelSignals,
  newlyOpened,
  type SignalProbe,
  StorySignals,
} from '../src/client/app/tut_signals';
import { ClientSaves, MemoryStore } from '../src/client/hud/save_slots';
import { SEEN_KEPT, TRACK_MAX, TrackerState } from '../src/client/hud/tracker_model';
import type { ClientAdapters } from '../src/client/view/adapters';
import type { GameView } from '../src/client/view/game_view';
import {
  availableWindows,
  isWindowAvailable,
  PLANNED_WINDOWS,
  WINDOW_DEFS,
  windowDef,
} from '../src/client/windows/window_registry';
import {
  AvailabilityFlags,
  CODEX_MONSTERS,
  UNLOCK_WINDOWS,
  unlockKey,
  windowUnlocks,
} from '../src/client/windows/window_unlocks';
import {
  CLIENT_SEGMENT_LIMIT,
  ContainerBackend,
  isHeaderDraft,
  MemoryStorage,
} from '../src/core/save';

// ---------------------------------------------------------------------------
// window availability

/** A stub view: only `flags` and `tick` are read by the availability flags. */
function stubView(flags: Record<string, unknown> = {}, tick = 0): GameView {
  return { tick, flags: () => flags } as unknown as GameView;
}

/** Adapters answering each probe with `n` rows (or nothing). */
function stubAdapters(n: Partial<Record<string, number>>): ClientAdapters {
  const rows = (k: string) => Array.from({ length: n[k] ?? 0 }, (_, i) => ({ id: `${k}_${i}` }));
  return {
    partyRoster: { roster: () => rows('party') },
    deeds: {
      book: () => ({ deeds: rows('deeds').map(() => ({ earnedTick: 5 })) }),
    },
    codex: { page: () => rows('codex') },
    letters: { inbox: () => rows('letters') },
    evidence: { evidence: () => rows('evidence') },
    dungeon: { dungeons: () => rows('dungeon') },
    beasts: { pets: () => rows('pets'), mounts: () => rows('mounts') },
    craft: {
      livelihoods: () => ({ skills: rows('skills'), drunk: 0 }),
      stations: () => rows('stations'),
    },
  } as unknown as ClientAdapters;
}

describe('act-1 window availability (1.5, UX-8)', () => {
  it('moves the nine act-1 windows into the built registry; atlas, market, council, army stay planned', () => {
    const act1 = [
      'deeds',
      'codex',
      'craft',
      'gather',
      'beasts',
      'board',
      'letters',
      'dungeon',
      'evidence',
    ];
    for (const id of act1) expect(WINDOW_DEFS.some((d) => d.id === id)).toBe(true);
    expect(PLANNED_WINDOWS.map((w) => w.id).sort()).toEqual(['army', 'atlas', 'council', 'market']);
  });

  it('keeps the board and the gather panel off the menu bar (they open where they stand)', () => {
    expect(windowDef('board').menuBar).toBe(false);
    expect(windowDef('gather').menuBar).toBe(false);
    for (const id of UNLOCK_WINDOWS) {
      expect(windowDef(id).menuBar).toBe(true);
      expect(windowDef(id).requiresAll).toEqual([unlockKey(id)]);
    }
  });

  it('shows no act-1 menu window before its moment (no empty shells)', () => {
    const shown = availableWindows({}, false).map((d) => d.id);
    for (const id of UNLOCK_WINDOWS) expect(shown).not.toContain(id);
  });

  it('opens each window at its own moment, and only that one', () => {
    const cases: [string, Partial<Record<string, number>>][] = [
      ['party', { party: 1 }],
      ['deeds', { deeds: 1 }],
      ['codex', { codex: CODEX_MONSTERS }],
      ['letters', { letters: 1 }],
      ['evidence', { evidence: 1 }],
      ['dungeon', { dungeon: 1 }],
      ['beasts', { pets: 1 }],
      ['craft', { skills: 1 }],
    ];
    for (const [id, n] of cases) {
      const keys = windowUnlocks(stubView(), stubAdapters(n));
      expect(Object.keys(keys), id).toEqual([`client.win.${id}`]);
      expect(isWindowAvailable(windowDef(id as never), keys, false)).toBe(true);
    }
  });

  it('needs the third monster for the bestiary, and a mount or a station also counts', () => {
    expect(windowUnlocks(stubView(), stubAdapters({ codex: CODEX_MONSTERS - 1 }))).toEqual({});
    expect(windowUnlocks(stubView(), stubAdapters({ mounts: 1 }))).toEqual({
      'client.win.beasts': true,
    });
    expect(windowUnlocks(stubView(), stubAdapters({ stations: 1 }))).toEqual({
      'client.win.craft': true,
    });
  });

  it('merges the discovery keys into the world flags, recomputed once per tick', () => {
    const flags = { act: 'act1' };
    const counts = { deeds: 0 };
    let calls = 0;
    const a = stubAdapters({});
    (a as { deeds: unknown }).deeds = {
      book: () => {
        calls++;
        return { deeds: counts.deeds ? [{ earnedTick: 1 }] : [] };
      },
    };
    const view = { tick: 1, flags: () => flags } as unknown as GameView & { tick: number };
    const f = new AvailabilityFlags(view, a);
    expect(f.current()).toEqual({ act: 'act1' });
    counts.deeds = 1;
    // same tick: the cached answer stands, the probe does not run again
    expect(f.current()['client.win.deeds']).toBeUndefined();
    expect(calls).toBe(1);
    (view as { tick: number }).tick = 2;
    expect(f.current()).toEqual({ act: 'act1', 'client.win.deeds': true });
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// onboarding level signals

function probe(over: Partial<SignalProbe> = {}): SignalProbe {
  return {
    talkableNear: false,
    talking: false,
    hostileNear: false,
    hostileTarget: false,
    fighting: false,
    hpShare: 1,
    boardNear: false,
    nodeNear: false,
    stationNear: false,
    act: 'act1',
    hour: 8,
    canSave: false,
    padConnected: false,
    ...over,
  };
}

describe('onboarding level signals (17.5)', () => {
  it('reads low health under 40% and recovery at 80%', () => {
    expect(levelSignals(probe({ hpShare: 0.39 })).has('low_hp')).toBe(true);
    expect(levelSignals(probe({ hpShare: 0.4 })).has('low_hp')).toBe(false);
    expect(levelSignals(probe({ hpShare: 0.79 })).has('hp_recovered')).toBe(false);
    expect(levelSignals(probe({ hpShare: 0.8 })).has('hp_recovered')).toBe(true);
    const none = levelSignals(probe({ hpShare: null }));
    expect(none.has('low_hp') || none.has('hp_recovered')).toBe(false);
  });

  it('marks a fight as started while fighting and ended otherwise', () => {
    const f = levelSignals(probe({ fighting: true }));
    expect(f.has('combat_started')).toBe(true);
    expect(f.has('combat_ended')).toBe(false);
    expect(levelSignals(probe()).has('combat_ended')).toBe(true);
  });

  it('offers saving only outside the prologue, and dusk from the dusk hour', () => {
    expect(levelSignals(probe({ canSave: true })).has('save_available')).toBe(true);
    expect(levelSignals(probe({ canSave: true, act: 'prologue' })).has('save_available')).toBe(
      false,
    );
    expect(levelSignals(probe({ hour: DUSK_HOUR - 1 })).has('dusk')).toBe(false);
    expect(levelSignals(probe({ hour: DUSK_HOUR })).has('dusk')).toBe(true);
  });

  it('counts a board, a node or a station as something to interact with', () => {
    for (const k of ['boardNear', 'nodeNear', 'stationNear', 'talkableNear'] as const) {
      expect(levelSignals(probe({ [k]: true })).has('near_interactable'), k).toBe(true);
    }
    expect(levelSignals(probe()).has('near_interactable')).toBe(false);
    expect(levelSignals(probe({ stationNear: true })).has('station_left')).toBe(false);
  });

  it('reports newly opened windows and the first menu', () => {
    const r = newlyOpened(new Set(['quests']), new Set(['quests', 'menu', 'deeds']));
    expect(r.opened.sort()).toEqual(['deeds', 'menu']);
    expect(r.menu).toBe(true);
    expect(newlyOpened(new Set(['menu']), new Set(['menu'])).menu).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// the save's client segment

describe('the client segment (17.8)', () => {
  it('round-trips the tutorial, the tracker and the notes', () => {
    const seg = buildClientSegment({
      tutorial: { v: 1, guidance: 'brief', seen: ['tut_a1_wake'], done: [] },
      tracker: { tracked: [{ id: 'q1', manual: true }], seen: ['q1'], door: null },
      notes: { ev_ledger: '对不上的账' },
    });
    expect(seg?.v).toBe(CLIENT_SEGMENT_VERSION);
    const back = parseClientSegment(JSON.parse(JSON.stringify(seg)));
    expect(back).toEqual(seg);
  });

  it('refuses another version and a non-object', () => {
    expect(parseClientSegment({ v: CLIENT_SEGMENT_VERSION + 1 })).toBeNull();
    expect(parseClientSegment('x')).toBeNull();
    expect(parseClientSegment(null)).toBeNull();
  });

  it('drops a segment over the size cap instead of writing it', () => {
    const big = { blob: 'x'.repeat(CLIENT_SEGMENT_MAX_CHARS) };
    expect(buildClientSegment({ tutorial: big })).toBeNull();
  });

  it('cuts notes to the note length, ignores empty ones and keeps at most the cap', () => {
    const n = new EvidenceNotes();
    n.setNote('a', 'x'.repeat(NOTE_MAX_CHARS + 5));
    expect([...n.note('a')]).toHaveLength(NOTE_MAX_CHARS);
    n.setNote('a', '   ');
    expect(n.note('a')).toBe('');
    for (let i = 0; i < NOTES_MAX + 3; i++) n.setNote(`id${i}`, 'note');
    expect(Object.keys(n.snapshot())).toHaveLength(NOTES_MAX);
    n.restore({ ok: 'kept', bad: 3 });
    expect(n.snapshot()).toEqual({ ok: 'kept' });
  });

  it('restores the tracker state field by field', () => {
    const t = new TrackerState();
    t.toggle('q_a1_m01');
    t.pinDoor('door_first');
    const snap = JSON.parse(JSON.stringify(t.snapshot()));
    const u = new TrackerState();
    expect(u.restore(snap)).toBe(true);
    expect(u.ids()).toEqual(['q_a1_m01']);
    expect(u.pinnedDoor).toBe('door_first');
    expect(u.restore('nope')).toBe(false);
    const many = Array.from({ length: TRACK_MAX + 4 }, (_, i) => ({ id: `q${i}`, manual: true }));
    const w = new TrackerState();
    w.restore({ tracked: [...many, { id: 'q0', manual: false }, { id: 7 }], seen: [], door: 3 });
    expect(w.ids()).toHaveLength(TRACK_MAX);
    expect(w.pinnedDoor).toBeNull();
  });
});

describe('the slot header carries the client segment and the difficulty (3.5, 17.8)', () => {
  function saves(): ClientSaves {
    return new ClientSaves({
      backend: new ContainerBackend(new MemoryStorage(), {
        now: () => 0,
        writer: { id: 'w-test', name: 'test' },
      }),
      now: () => Date.UTC(2026, 10, 18),
      newRunId: () => 'r-beef0001',
      versions: { gameVersion: '0.1.0', renameVersion: 0, build: 'test' },
      extras: new MemoryStore(),
    });
  }

  it('writes the segment and the difficulty, and a load hands them back', async () => {
    const s = saves();
    await s.open();
    const engine = createSandboxGame(7);
    engine.world.meta.flags.difficulty = 'hard';
    s.attach(engine);
    const seg = buildClientSegment({ notes: { ev_ledger: '可能有用' } });
    s.setClientSegment(() => seg);
    const m = await s.save('manual_01', { mapId: 'client_sandbox', mapName: '' });
    expect(m.difficulty).toBe('hard');
    const loaded = await s.load('manual_01');
    expect(loaded.header.summary.difficulty).toBe('hard');
    expect(parseClientSegment(loaded.header.client)).toEqual(seg);
  });

  it('saves without a segment when the session gives none or its read fails', async () => {
    const s = saves();
    await s.open();
    s.attach(createSandboxGame(8));
    s.setClientSegment(() => {
      throw new Error('broken store');
    });
    await s.save('manual_02', { mapId: 'client_sandbox', mapName: '' });
    expect((await s.load('manual_02')).header.client).toBeUndefined();
  });

  it('accepts an object segment under the limit and refuses anything else', async () => {
    const s = saves();
    await s.open();
    s.attach(createSandboxGame(9));
    s.setClientSegment(() => buildClientSegment({}));
    await s.save('manual_03', { mapId: 'client_sandbox', mapName: '' });
    const h = (await s.load('manual_03')).header;
    expect(isHeaderDraft(h)).toBe(true);
    const { client: _drop, ...without } = h;
    expect(isHeaderDraft(without)).toBe(true);
    expect(isHeaderDraft({ ...h, client: 'x' })).toBe(false);
    expect(isHeaderDraft({ ...h, client: ['x'] })).toBe(false);
    expect(isHeaderDraft({ ...h, client: { blob: 'x'.repeat(CLIENT_SEGMENT_LIMIT) } })).toBe(false);
    expect(CLIENT_SEGMENT_LIMIT).toBeGreaterThanOrEqual(CLIENT_SEGMENT_MAX_CHARS);
  });
});

describe('openings are sticky and kept with the save (1.5)', () => {
  it('keeps a window open after its moment passes, and stops probing it', () => {
    const n = { stations: 1 };
    let probes = 0;
    const a = stubAdapters({});
    (a as { craft: unknown }).craft = {
      livelihoods: () => ({ skills: [], drunk: 0 }),
      stations: () => {
        probes++;
        return n.stations ? [{ id: 'st' }] : [];
      },
    };
    const view = { tick: 1, flags: () => ({}) } as unknown as GameView & { tick: number };
    const f = new AvailabilityFlags(view, a);
    expect(f.current()['client.win.craft']).toBe(true);
    n.stations = 0;
    (view as { tick: number }).tick = 2;
    // the player walked away from the station: the window stays
    expect(f.current()['client.win.craft']).toBe(true);
    expect(probes).toBe(1);
    expect(f.snapshot()).toEqual(['craft']);
  });

  it('restores the openings of a save and ignores unknown ids', () => {
    const f = new AvailabilityFlags(stubView(), stubAdapters({}));
    f.restore(['deeds', 'nope', 3]);
    expect(f.current()['client.win.deeds']).toBe(true);
    expect(f.snapshot()).toEqual(['deeds']);
    f.restore('broken');
    expect(f.snapshot()).toEqual(['deeds']);
  });
});

describe('story signals for the prologue and the scenes (17.5)', () => {
  const base = {
    act: 'prologue',
    waiting: null as string | null,
    keyed: false,
    keyChoice: false,
    listen: null as string | null,
    shop: false,
    deadline: false,
  };

  it('reads the first prologue input as the name, the next as the interview answer', () => {
    const s = new StorySignals();
    expect([...s.update({ ...base, waiting: 'input' })]).toContain('name_prompt');
    const after = s.update({ ...base, waiting: 'advance' });
    expect(after.has('name_answered')).toBe(true);
    expect(after.has('name_prompt')).toBe(false);
    const q = s.update({ ...base, waiting: 'input' });
    expect(q.has('answer_prompt')).toBe(true);
    expect(q.has('name_prompt')).toBe(false);
    expect(s.update({ ...base, waiting: 'advance' }).has('answered')).toBe(true);
    // both are spent: later inputs fire neither
    const later = s.update({ ...base, waiting: 'input' });
    expect(later.has('name_prompt') || later.has('answer_prompt')).toBe(false);
  });

  it('raises the prologue prompts only in the prologue', () => {
    const s = new StorySignals();
    expect(s.update({ ...base, act: 'act1', waiting: 'input' }).has('name_prompt')).toBe(false);
  });

  it('pulses the end of the fall, a key choice, the evidence, the eavesdropping and the shop', () => {
    const s = new StorySignals();
    const on = s.update({
      ...base,
      keyed: true,
      keyChoice: true,
      waiting: 'court',
      listen: 'far',
      shop: true,
      deadline: true,
    });
    for (const x of [
      'falling',
      'key_choice',
      'evidence_prompt',
      'listen_far',
      'shop_open',
      'deadline_quest',
    ])
      expect(on.has(x as never), x).toBe(true);
    const off = s.update({ ...base });
    for (const x of [
      'fall_ended',
      'key_choice_made',
      'evidence_shown',
      'listen_end',
      'shop_closed',
    ])
      expect(off.has(x as never), x).toBe(true);
    // a pulse lasts one refresh
    const quiet = s.update({ ...base });
    expect(quiet.size).toBe(0);
  });

  it('marks only the far tier as far', () => {
    const s = new StorySignals();
    expect(s.update({ ...base, listen: 'mid' }).has('listen_far')).toBe(false);
  });
});

describe('the client segment keeps the guidance when it overflows (17.8)', () => {
  it('drops the tracker first, then the notes, before giving up', () => {
    const big = { tracked: [], seen: ['x'.repeat(CLIENT_SEGMENT_MAX_CHARS)], door: null };
    const seg = buildClientSegment({
      tutorial: { v: 1, guidance: 'brief', seen: [], done: [] },
      tracker: big,
      notes: { ev: '可能有用' },
      unlocks: ['deeds'],
    });
    expect(seg?.tracker).toBeUndefined();
    expect(seg?.notes).toEqual({ ev: '可能有用' });
    expect(seg?.unlocks).toEqual(['deeds']);
    expect(seg?.tutorial).toEqual({ v: 1, guidance: 'brief', seen: [], done: [] });
  });

  it('keeps only the most recent quests seen in a snapshot', () => {
    const t = new TrackerState();
    t.sync(Array.from({ length: SEEN_KEPT + 50 }, (_, i) => ({ id: `q${i}`, kind: 'commission' })));
    const snap = t.snapshot();
    expect(snap.seen).toHaveLength(SEEN_KEPT);
    expect(snap.seen.at(-1)).toBe(`q${SEEN_KEPT + 49}`);
  });
});

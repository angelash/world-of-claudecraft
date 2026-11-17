// PK-M1-22 fork B: the new game page (ui_scr_newgame), the save list shared by ui_scr_load and
// ui_win_saves (metadata, empty and error states, the prologue and ironman rules), the slot
// extras (thumbnail and difficulty beside a slot), the ironman client rules over the RunSaver,
// and the legend exemption from the ring slowdown. Pure cores in Node.

import { describe, expect, it } from 'vitest';
import {
  aiCardEnv,
  DEFAULT_CHOICES,
  newGameModel,
  startCommands,
  startConfirm,
} from '../src/client/app/newgame_model';
import { PlayerInput, type PlayerInputHost } from '../src/client/app/player_input';
import { createSandboxGame } from '../src/client/app/sandbox';
import { coverCrop } from '../src/client/app/thumbnail';
import { CONFIRM_HOLD_MS } from '../src/client/hud/confirm_model';
import {
  aiModeText,
  freeManualSlot,
  MANUAL_LIMIT,
  playTimeText,
  type SaveListInput,
  saveListModel,
} from '../src/client/hud/save_list_model';
import {
  ClientSaves,
  MemoryStore,
  type SaveFailed,
  type SlotMeta,
  saveBlock,
  slotProblem,
} from '../src/client/hud/save_slots';
import {
  EXTRAS_PREFIX,
  MAX_THUMB_CHARS,
  parseExtras,
  SlotExtrasStore,
} from '../src/client/hud/slot_extras';
import { RING_TIME_SCALE } from '../src/client/input/radial';
import { Engine } from '../src/core/engine';
import { ContainerBackend, MemoryStorage, type SlotRecord } from '../src/core/save';
import { createGame } from '../src/game/create';

const THUMB = `data:image/jpeg;base64,${'A'.repeat(64)}`;

function backend(): ContainerBackend {
  return new ContainerBackend(new MemoryStorage(), {
    now: () => 0,
    writer: { id: 'w-test', name: 'test' },
  });
}

function saves(opts: { extras?: MemoryStore; clock?: { t: number }; preset?: string } = {}) {
  let n = 0;
  const clock = opts.clock ?? { t: Date.UTC(2026, 10, 17) };
  return new ClientSaves({
    backend: backend(),
    now: () => clock.t,
    newRunId: () => `r-beef${String(++n).padStart(4, '0')}`,
    versions: { gameVersion: '0.1.0', renameVersion: 0, build: 'test' },
    extras: opts.extras ?? new MemoryStore(),
    aiPreset: () => opts.preset ?? 'tiered',
    manualLimit: MANUAL_LIMIT.web,
  });
}

function meta(slot: SlotMeta['slot'], over: Partial<SlotMeta> = {}): SlotMeta {
  return {
    slot,
    tick: 0,
    date: '圣历 998 年 春 第 1 日 06:00',
    mapName: '边石镇',
    savedAt: '2026-11-17T00:00:00.000Z',
    bytes: 10,
    label: '',
    writerName: 'test',
    recovered: false,
    fallback: false,
    act: 'act1',
    runId: 'r-aaaa0001',
    level: 3,
    playSeconds: 3700,
    aiPreset: 'off',
    ironman: false,
    difficulty: 'standard',
    thumb: null,
    ...over,
  };
}

function listInput(over: Partial<SaveListInput> = {}): SaveListInput {
  return {
    mode: 'game',
    list: {},
    problems: {},
    block: null,
    run: { id: 'r-aaaa0001', ironman: false },
    manualLimit: 5,
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe('slot extras (thumbnail and difficulty beside a slot)', () => {
  it('keeps a record per header and never shows a stale one', () => {
    const kv = new MemoryStore();
    const store = new SlotExtrasStore(kv);
    const h = { runId: 'r-aaaa0001', savedAt: '2026-11-17T00:00:00.000Z' };
    store.begin('manual_01', { ...h, difficulty: 'hard' });
    expect(store.get('manual_01', h)).toEqual({ ...h, difficulty: 'hard' });
    expect(store.setThumb('manual_01', h, THUMB)).toBe(true);
    expect(store.get('manual_01', h)?.thumb).toBe(THUMB);
    // the slot was overwritten elsewhere: another save time, another run
    expect(store.get('manual_01', { ...h, savedAt: '2026-11-18T00:00:00.000Z' })).toBeNull();
    expect(store.get('manual_01', { ...h, runId: 'r-bbbb0002' })).toBeNull();
    // a thumbnail for a header the slot no longer holds is refused
    expect(store.setThumb('manual_01', { ...h, runId: 'r-bbbb0002' }, THUMB)).toBe(false);
  });

  it('refuses malformed and oversized thumbnails, drops broken records, prunes and removes', () => {
    const kv = new MemoryStore();
    const store = new SlotExtrasStore(kv);
    const h = { runId: 'r-aaaa0001', savedAt: 's' };
    store.begin('quick', h);
    expect(store.setThumb('quick', h, 'javascript:alert(1)')).toBe(false);
    expect(
      store.setThumb('quick', h, `data:image/jpeg;base64,${'A'.repeat(MAX_THUMB_CHARS)}`),
    ).toBe(false);
    expect(parseExtras('{')).toBeNull();
    expect(parseExtras('{"runId":1}')).toBeNull();
    expect(parseExtras('{"runId":"r","savedAt":"s","difficulty":"easy"}')).toEqual({
      runId: 'r',
      savedAt: 's',
    });
    store.begin('manual_02', h);
    store.prune(new Map([['quick', h]]));
    expect(kv.getItem(`${EXTRAS_PREFIX}quick`)).not.toBeNull();
    expect(kv.getItem(`${EXTRAS_PREFIX}manual_02`)).toBeNull();
    store.remove('quick');
    expect(kv.getItem(`${EXTRAS_PREFIX}quick`)).toBeNull();
    // no storage at all: nothing is kept, nothing throws
    const none = new SlotExtrasStore(null);
    none.begin('quick', h);
    expect(none.get('quick', h)).toBeNull();
  });

  it('keeps the record without its picture when the storage refuses the picture', () => {
    const kv = new MemoryStore();
    const store = new SlotExtrasStore(kv);
    const h = { runId: 'r-aaaa0001', savedAt: 's' };
    store.begin('quick', { ...h, difficulty: 'story' });
    const set = kv.setItem.bind(kv);
    kv.setItem = (k, v) => {
      if (v.includes('data:image'))
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      set(k, v);
    };
    expect(store.setThumb('quick', h, THUMB)).toBe(false);
    expect(store.get('quick', h)).toEqual({ ...h, difficulty: 'story' });
  });
});

describe('client saves: metadata, problems and ironman runs', () => {
  it('fills level, play time, AI preset and difficulty, and keeps a thumbnail', async () => {
    const clock = { t: Date.UTC(2026, 10, 17) };
    const s = saves({ clock, preset: 'single' });
    await s.open();
    const engine = createSandboxGame(5);
    engine.queue('flag.set', { key: 'difficulty', value: 'hard' });
    engine.step(2);
    s.attach(engine);
    clock.t += 125_000;
    const m = await s.save('manual_01', { mapId: 'client_sandbox', mapName: '沙盒' });
    expect(m.playSeconds).toBe(125);
    expect(m.difficulty).toBe('hard');
    // the sandbox runs without a model: the built-in AI whatever the preset says
    expect(m.aiPreset).toBe('off');
    expect(m.ironman).toBe(false);
    expect(m.runId).toBe(s.runId);
    expect(s.setThumb(m, THUMB)).toBe(true);
    expect(s.meta('manual_01')?.thumb).toBe(THUMB);
    await s.refresh();
    expect(s.meta('manual_01')?.thumb).toBe(THUMB);
    // a later save of the same slot starts a fresh record (no stale picture)
    clock.t += 1000;
    const again = await s.save('manual_01', { mapId: 'client_sandbox', mapName: '沙盒' });
    expect(again.thumb).toBeNull();
    expect(again.playSeconds).toBe(126);
    await s.remove('manual_01');
    expect(s.meta('manual_01')).toBeUndefined();
  });

  it('a failed listing keeps the last list and every thumbnail (nothing is pruned on it)', async () => {
    const be = backend();
    let failing = false;
    const list = be.list.bind(be);
    be.list = async () => {
      if (failing) throw new Error('storage unavailable');
      return list();
    };
    const extras = new MemoryStore();
    const s = new ClientSaves({
      backend: be,
      now: () => Date.UTC(2026, 10, 17),
      newRunId: () => 'r-beef0001',
      versions: { gameVersion: '0.1.0', renameVersion: 0, build: 'test' },
      extras,
    });
    await s.open();
    s.attach(createSandboxGame(5));
    const m = await s.save('manual_01', { mapId: 'client_sandbox', mapName: '' });
    expect(s.setThumb(m, THUMB)).toBe(true);
    failing = true;
    await s.refresh();
    expect(s.meta('manual_01')?.thumb).toBe(THUMB);
    expect(extras.getItem(`${EXTRAS_PREFIX}manual_01`)).not.toBeNull();
    failing = false;
    await s.refresh();
    expect(s.meta('manual_01')?.thumb).toBe(THUMB);
  });

  it('continues the play time of a loaded save', async () => {
    const clock = { t: Date.UTC(2026, 10, 17) };
    const s = saves({ clock });
    await s.open();
    const engine = createSandboxGame(6);
    s.attach(engine);
    clock.t += 60_000;
    await s.save('quick', { mapId: '', mapName: '' });
    const loaded = await s.load('quick');
    s.attach(engine, loaded);
    clock.t += 30_000;
    expect(s.playSeconds()).toBe(90);
  });

  it('routes an ironman run to its one slot: no manual or quick saves, autosave and exit only', async () => {
    const s = saves();
    await s.open();
    const engine = createSandboxGame(7);
    s.attach(engine, null, { ironman: true });
    expect(s.ironman).toBe(true);
    const err = (await s.save('quick', { mapId: '', mapName: '' }).catch((e) => e)) as SaveFailed;
    expect(err.code).toBe('bad_request');
    const auto = await s.autosave({ mapId: '', mapName: '' });
    expect(auto.slot).toBe('ironman');
    expect(auto.ironman).toBe(true);
    const exit = await s.exitSave({ mapId: '', mapName: '' });
    expect(exit?.slot).toBe('ironman');
    expect(Object.keys(s.list())).toEqual(['ironman']);
    // a loaded ironman save keeps the run an ironman run
    const loaded = await s.load('ironman');
    s.attach(engine, loaded);
    expect(s.ironman).toBe(true);
    // an ordinary run writes no exit save and autosaves into the ring
    const plain = saves();
    await plain.open();
    plain.attach(createSandboxGame(8));
    expect(await plain.exitSave({ mapId: '', mapName: '' })).toBeNull();
    expect((await plain.autosave({ mapId: '', mapName: '' })).slot).toBe('auto_1');
  });

  it('tells damaged and newer slots apart', async () => {
    const s = saves();
    await s.open();
    s.attach(createSandboxGame(9));
    await s.save('manual_01', { mapId: '', mapName: '' });
    const header = s.meta('manual_01') ? (await s.load('manual_01')).header : null;
    expect(header).not.toBeNull();
    const h = header as NonNullable<typeof header>;
    const rec = (over: Partial<SlotRecord>): SlotRecord => ({
      slot: 'manual_02',
      header: null,
      prev: null,
      ...over,
    });
    expect(slotProblem(rec({ problem: 'bad_hash' }))).toBe('corrupt');
    expect(slotProblem(rec({ problem: 'newer_container' }))).toBe('newer');
    expect(slotProblem(rec({ header: h }))).toBeNull();
    expect(slotProblem(rec({ header: { ...h, worldVersion: h.worldVersion + 1 } }))).toBe('newer');
    expect(slotProblem(rec({ header: { ...h, gameVersion: '9.0.0' } }), '0.1.0')).toBe('newer');
    expect(slotProblem(rec({ problem: 'missing' }))).toBeNull();
  });

  it('blocks saving in the prologue, in scenes, conversations and while writing', () => {
    const engine = createSandboxGame(10);
    const w = engine.world;
    const s = { inScene: false, talking: false, writing: false };
    expect(saveBlock(w, s)).toBeNull();
    expect(saveBlock(w, { ...s, inScene: true })).toBe('scene');
    expect(saveBlock(w, { ...s, talking: true })).toBe('dialogue');
    expect(saveBlock(w, { ...s, writing: true })).toBe('writing');
    w.meta.flags.act = 'prologue';
    expect(saveBlock(w, s)).toBe('prologue');
  });
});

describe('save list model (ui_scr_load, ui_win_saves)', () => {
  it('shows the empty state on the title and a "save here" row in game', () => {
    const title = saveListModel(listInput({ mode: 'title', run: null }));
    expect(title.rows).toEqual([]);
    expect(title.empty).toBe('还没有存档');
    const game = saveListModel(listInput());
    expect(game.empty).toBe('还没有存档');
    expect(game.rows.map((r) => [r.slot, r.state])).toEqual([['manual_01', 'new']]);
    expect(game.rows[0]?.save).toEqual({ enabled: true, reason: '', confirm: null });
  });

  it('lists saves newest first with their metadata, badges and confirms', () => {
    const m = saveListModel(
      listInput({
        mode: 'title',
        run: null,
        list: {
          quick: meta('quick', { savedAt: '2026-11-10T00:00:00.000Z' }),
          manual_02: meta('manual_02', {
            savedAt: '2026-11-12T00:00:00.000Z',
            ironman: true,
            aiPreset: 'tiered',
            difficulty: 'legend',
            thumb: THUMB,
          }),
        },
      }),
    );
    expect(m.rows.map((r) => r.slot)).toEqual(['manual_02', 'quick']);
    const top = m.rows[0];
    expect(top?.thumb).toBe(THUMB);
    expect(top?.badges.map((b) => b.text)).toEqual(['传说', '铁人', '分档']);
    expect(top?.lines[0]).toBe('第一幕  边石镇');
    expect(top?.lines[2]).toBe('游玩 1 小时 1 分钟  历练等级 3');
    expect(top?.lines[3]).toMatch(/^存于 /);
    // the title loads at once; deleting is irreversible
    expect(top?.load).toEqual({ enabled: true, reason: '', confirm: null });
    expect(top?.save).toBeNull();
    expect(top?.remove?.confirm?.irreversible).toBe(true);
  });

  it('marks damaged, newer and fallback saves (3.5 error states)', () => {
    const m = saveListModel(
      listInput({
        list: {
          manual_01: meta('manual_01', { fallback: true }),
          manual_03: meta('manual_03', { savedAt: '2026-11-01T00:00:00.000Z' }),
        },
        problems: { manual_03: 'newer', auto_2: 'corrupt' },
      }),
    );
    const by = Object.fromEntries(m.rows.map((r) => [r.slot, r]));
    expect(by.manual_01?.state).toBe('fallback');
    expect(by.manual_01?.note).toBe('这个存档的最新一份已损坏，读取的是它的上一份');
    expect(by.manual_01?.load?.enabled).toBe(true);
    expect(by.manual_03?.state).toBe('newer');
    expect(by.manual_03?.load).toMatchObject({ enabled: false });
    expect(by.manual_03?.save).toMatchObject({ enabled: false });
    expect(by.auto_2?.state).toBe('corrupt');
    expect(by.auto_2?.note).toBe('这个存档已损坏，无法读取');
    expect(by.auto_2?.load?.enabled).toBe(false);
    expect(by.auto_2?.remove?.enabled).toBe(true);
    // the first manual slot free of saves and problems is offered
    expect(m.rows.at(-1)).toMatchObject({ slot: 'manual_02', state: 'new' });
  });

  it('greys the whole list in the prologue and waits in fights with a reason', () => {
    const list = { quick: meta('quick') };
    const pro = saveListModel(listInput({ list, block: 'prologue' }));
    expect(pro.disabled).toBe(true);
    expect(pro.notice).toBe('序章不能存档');
    for (const r of pro.rows) {
      for (const b of [r.save, r.load, r.remove]) if (b) expect(b.enabled).toBe(false);
    }
    const fight = saveListModel(listInput({ list, block: 'combat' }));
    expect(fight.disabled).toBe(false);
    expect(fight.notice).toBe('战斗中不能存档');
    const quick = fight.rows.find((r) => r.slot === 'quick');
    expect(quick?.save).toMatchObject({ enabled: false, reason: '战斗中不能存档' });
    expect(quick?.load?.enabled).toBe(true);
    expect(quick?.load?.confirm?.body).toBe('读取存档会丢失当前未保存的进度，继续？');
  });

  it('shows an ironman run only its own slot, with no save, load or delete', () => {
    const m = saveListModel(
      listInput({
        run: { id: 'r-aaaa0001', ironman: true },
        list: {
          ironman: meta('ironman', { ironman: true }),
          quick: meta('quick', { runId: 'r-other001' }),
        },
      }),
    );
    expect(m.rows.map((r) => r.slot)).toEqual(['ironman']);
    expect(m.notice).toBe('铁人局只有一个存档位，自动存档会覆盖它');
    const r = m.rows[0];
    expect(r?.save).toMatchObject({ enabled: false, reason: '铁人局只在自动存档点保存' });
    expect(r?.load).toMatchObject({ enabled: false, reason: '铁人局不能读回存档' });
    expect(r?.remove).toBeNull();
  });

  it('formats play time and AI modes, and finds a free manual slot within the limit', () => {
    expect(playTimeText(20)).toBe('不到 1 分钟');
    expect(playTimeText(600)).toBe('10 分钟');
    expect(playTimeText(3 * 3600 + 120)).toBe('3 小时 2 分钟');
    expect(aiModeText('off')).toBe('内置 AI');
    expect(aiModeText('local')).toBe('本机');
    expect(aiModeText('https://example.test')).toBe('自定义');
    const full = Object.fromEntries((['manual_01', 'manual_02'] as const).map((s) => [s, meta(s)]));
    expect(freeManualSlot(full, {}, 2)).toBeNull();
    expect(freeManualSlot(full, {}, 3)).toBe('manual_03');
    expect(freeManualSlot({}, { manual_01: 'corrupt' }, 2)).toBe('manual_02');
  });
});

describe('new game page (ui_scr_newgame)', () => {
  const env = {
    ai: { preset: 'off', lastTestFailed: false },
    storage: { durable: true, low: false },
    ironmanSlotTaken: false,
  };

  it('offers four difficulty cards with standard selected, ironman off and full guidance', () => {
    const m = newGameModel({ ...DEFAULT_CHOICES }, env);
    expect(m.cards.map((c) => c.id)).toEqual(['story', 'standard', 'hard', 'legend']);
    expect(m.cards.filter((c) => c.selected).map((c) => c.id)).toEqual(['standard']);
    for (const c of m.cards) expect(c.lines.length).toBe(3);
    expect(m.ironman.on).toBe(false);
    expect(m.guidance.options.filter((o) => o.selected).map((o) => o.id)).toEqual(['full']);
    expect(m.model.text).toBe('当前：内置 AI（完整体验）');
    expect(m.warnings).toEqual([]);
    expect(m.confirm).toBeNull();
  });

  it('shows the model card states and the storage warnings (3.4.2)', () => {
    const failed = newGameModel(DEFAULT_CHOICES, {
      ...env,
      ai: { preset: 'tiered', lastTestFailed: true },
    });
    expect(failed.model.text).toBe('当前：分档');
    expect(failed.model.note).toBe('已配置，但上次连接测试失败，开局后由内置 AI 接手');
    const memory = newGameModel(DEFAULT_CHOICES, {
      ...env,
      storage: { durable: false, low: true },
    });
    expect(memory.warnings).toEqual(['浏览器存储不可用：这次的存档在关闭页面后会丢失']);
    const low = newGameModel(DEFAULT_CHOICES, { ...env, storage: { durable: true, low: true } });
    expect(low.warnings).toEqual(['浏览器存储空间不足，可能无法存档']);
    expect(
      aiCardEnv({
        preset: 'single',
        connections: [{ lastTest: { ok: true } }, { lastTest: { ok: false } }],
      }),
    ).toEqual({ preset: 'single', lastTestFailed: true });
    expect(aiCardEnv({ preset: 'off', connections: [{ lastTest: { ok: false } }] })).toEqual({
      preset: 'off',
      lastTestFailed: false,
    });
  });

  it('restates legend and ironman in the confirm, irreversible when an old ironman save goes', () => {
    const legend = startConfirm({ ...DEFAULT_CHOICES, difficulty: 'legend' }, env);
    expect(legend?.body).toBe('传说难度只能在新游戏时选择，开局后不能切换到其他难度。');
    expect(legend?.irreversible).toBe(false);
    const iron = startConfirm(
      { ...DEFAULT_CHOICES, ironman: true },
      { ...env, ironmanSlotTaken: true },
    );
    expect(iron?.body.split('\n')).toEqual([
      '铁人模式：同伴与将领会永久死亡，这一局只有一个存档位，不能读回更早的进度。',
      '已有的铁人存档会被删除。',
    ]);
    expect(iron?.irreversible).toBe(true);
    expect(CONFIRM_HOLD_MS).toBe(600);
  });

  it('opens a run with the registered built-in variables, accepted by the flag guard', () => {
    const cmds = startCommands({ difficulty: 'legend', ironman: true, guidance: 'off' });
    expect(cmds).toEqual([
      { kind: 'flag.set', data: { key: 'difficulty', value: 'legend' } },
      { kind: 'flag.set', data: { key: 'ironman', value: true } },
    ]);
    const engine = createGame({ seed: 3, aiMode: 'off', flagPolicy: 'throw' });
    for (const c of cmds) engine.queue(c.kind, c.data as never);
    engine.step(1);
    expect(engine.world.meta.flags.difficulty).toBe('legend');
    expect(engine.world.meta.flags.ironman).toBe(true);
    // the same opening on a second engine gives the same world (a replay starts the same)
    const twin = createGame({ seed: 3, aiMode: 'off', flagPolicy: 'throw' });
    for (const c of cmds) twin.queue(c.kind, c.data as never);
    twin.step(1);
    expect(twin.world.meta.flags).toEqual(engine.world.meta.flags);
    expect(engine).toBeInstanceOf(Engine);
  });
});

describe('thumbnail crop and the legend ring', () => {
  it('crops the centre of a canvas to 16:9', () => {
    expect(coverCrop(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(coverCrop(2000, 1000, 16 / 9)).toEqual({ x: 111, y: 0, w: 1778, h: 1000 });
    expect(coverCrop(1000, 1000, 16 / 9)).toEqual({ x: 0, y: 219, w: 1000, h: 563 });
  });

  it('keeps legend difficulty at full speed behind an open ring in a fight (16.5)', () => {
    const scales: number[] = [];
    const flags: Record<string, unknown> = { difficulty: 'standard' };
    const view = {
      tick: 10,
      playerId: () => 'p',
      flag: (k: string) => flags[k],
      world: { slices: { combat: { units: { p: { combatUntil: 50 } } } } },
    };
    const host = {
      view,
      setTimeScale: (s: number) => scales.push(s),
    } as unknown as PlayerInputHost;
    const input = new PlayerInput(host);
    input.ringOpen(true);
    expect(scales.at(-1)).toBe(RING_TIME_SCALE);
    flags.difficulty = 'legend';
    input.ringOpen(true);
    expect(scales.at(-1)).toBe(1);
    input.ringOpen(false);
    expect(scales.at(-1)).toBe(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({ setCharacterHotbarLayout: vi.fn(async () => true) }));

import { HotbarLayoutStore } from '../server/hotbar_layout';
import type { ActionBarLayout } from '../src/world_api/action_bar';

const layout = (id: string): ActionBarLayout => ({
  v: 1,
  forms: { normal: { bar: [{ type: 'ability', id }], attack: null } },
});
const session = (characterId = 1, leaseNonce = 'a') => ({
  characterId,
  leaseNonce,
  hotbarLayout: null,
  initialHotbarLayoutJson: 'null',
});
const spin = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('hotbar durability under overlapping saves', () => {
  it('caps database writes at two and flushes every dirty character', async () => {
    let active = 0,
      peak = 0;
    const releases: (() => void)[] = [];
    const persist = vi.fn(async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((r) => releases.push(r));
      active--;
      return true;
    });
    const store = new HotbarLayoutStore({ persist });
    for (let i = 1; i <= 5; i++) store.save(session(i), { layout: layout('a') });
    await spin();
    expect(active).toBe(2);
    const done = store.drain();
    for (let i = 0; i < 5; i++) {
      releases.shift()?.();
      await spin();
    }
    await done;
    expect(peak).toBe(2);
    expect(persist).toHaveBeenCalledTimes(5);
  });
  it('throttles continuous edits and force-flushes the newest profile merge', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => true);
    const store = new HotbarLayoutStore({ persist });
    const owner = session();
    store.save(owner, { layout: layout('a') });
    await spin();
    store.save(owner, { layout: layout('b') });
    store.save(owner, { profile: 'touch', layout: layout('c') });
    await spin();
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(persist).toHaveBeenCalledTimes(1);
    await store.flush(owner);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]).toEqual([
      1,
      expect.objectContaining({ profiles: { desktop: layout('b'), touch: layout('c') } }),
      'a',
    ]);
  });
  it('retains transient failures and retries them on the next explicit flush', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(true);
    const store = new HotbarLayoutStore({ persist, onError: () => {} });
    const owner = session();
    store.save(owner, { layout: layout('a') });
    await spin();
    expect(store.pending(1, 'a')).not.toBeNull();
    await store.flush(owner);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(store.pending(1, 'a')).toBeNull();
  });
  it('cancels delayed writes and refuses new saves after final drainage', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => true);
    const store = new HotbarLayoutStore({ persist });
    const owner = session();
    store.save(owner, { layout: layout('first') });
    await spin();
    store.save(owner, { layout: layout('latest') });
    expect(persist).toHaveBeenCalledTimes(1);
    await store.drain();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]).toEqual([
      1,
      expect.objectContaining({ profiles: { desktop: layout('latest') } }),
      'a',
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    store.save(owner, { layout: layout('after-close') });
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(store.pending(owner.characterId, owner.leaseNonce)).toBeNull();
  });
  it('an older nonce completion cannot erase a replacement or expose its pending data', async () => {
    let finish!: (ok: boolean) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue(true);
    const lost = vi.fn();
    const store = new HotbarLayoutStore({ persist, onLeaseLost: lost });
    const old = session();
    const fresh = session(1, 'b');
    store.save(old, { layout: layout('a') });
    await spin();
    store.save(fresh, { layout: layout('b') });
    await spin();
    expect(store.pending(1, 'a')).toBeNull();
    expect(store.pending(1, 'b')).not.toBeNull();
    finish(false);
    await store.flush(fresh);
    expect(lost).not.toHaveBeenCalled();
    expect(persist.mock.calls[1][2]).toBe('b');
  });
  it('a fence refusal is not retried and an awaited flush propagates database failure', async () => {
    const lost = vi.fn();
    const persist = vi.fn(async () => false);
    const store = new HotbarLayoutStore({ persist, onLeaseLost: lost });
    const owner = session();
    store.save(owner, { layout: layout('a') });
    await spin();
    expect(lost).toHaveBeenCalledWith(1, 'a');
    await store.flush(owner);
    expect(persist).toHaveBeenCalledTimes(1);
    const broken = new HotbarLayoutStore({
      persist: async () => {
        throw new Error('down');
      },
      onError: () => {},
    });
    broken.save(owner, { layout: layout('b') });
    await spin();
    await expect(broken.flush(owner)).rejects.toThrow('down');
  });
});

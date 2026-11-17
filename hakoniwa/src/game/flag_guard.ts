// The registry guard on every system's flag reads and writes (world_state_registry.md 9.4):
// each system sees a SystemContext whose `flag` and `setFlag` go through the variable
// registry. A read or a write through an alias reaches the canonical flag (a numeric
// alias converted, a `bond.<npc>.<n>` style alias read as its condition); a write of a
// name the registry does not know throws in a development build and is logged in a
// release build. The engine's own `flag.set` command (debug and script channel) is not
// a system and is not guarded. Deterministic: logging has no effect on the world.

import type { ContentMap, FlagValue } from '../core/contracts';
import { defaultRegistry, FlagRegistry, registryData } from '../core/registry';
import type { GameSystem, SystemContext } from '../core/system';
import { evaluate, flagResolver } from '../systems/quests/conditions';

export type FlagPolicy = 'throw' | 'log' | 'off';

const GUARDED = Symbol('flagGuard');

type Guarded = GameSystem & { [GUARDED]?: true };

/** The policy of this build: development builds (and tests) throw, release builds log. */
export function defaultFlagPolicy(): FlagPolicy {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  return env?.DEV ? 'throw' : 'log';
}

/** The registry the content carries (its own table when it differs from the shipped one). */
export function registryFor(content: ContentMap): FlagRegistry {
  const data = (content as { registry?: ContentMap['registry'] }).registry;
  return !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
}

export class UnregisteredFlagError extends Error {
  constructor(
    readonly key: string,
    readonly system: string,
  ) {
    super(`system ${system} wrote world flag ${key}, which the variable registry does not list`);
  }
}

/** The engine context a handler runs with, and whose handler it is (for the error). */
interface Running {
  ctx: SystemContext;
  system: string;
}

/**
 * One stable context for all guarded systems: it forwards to the engine context of the
 * running handler and puts the registry on flag and setFlag. A single object of fixed
 * shape keeps the systems' property reads fast (no copy or prototype per tick).
 */
function guardedContext(
  running: Running,
  registry: FlagRegistry,
  policy: FlagPolicy,
  log: (msg: string) => void,
): SystemContext {
  return {
    get world() {
      return running.ctx.world;
    },
    get content() {
      return running.ctx.content;
    },
    get tick() {
      return running.ctx.tick;
    },
    get ai() {
      return running.ctx.ai;
    },
    rng: (stream) => running.ctx.rng(stream),
    emit: (kind, data) => running.ctx.emit(kind, data),
    dispatch: (kind, data, source) => running.ctx.dispatch(kind, data, source),
    newId: (prefix) => running.ctx.newId(prefix),
    brainTrace: (trace) => running.ctx.brainTrace(trace),
    flag(key: string): FlagValue | undefined {
      const ctx = running.ctx;
      const r = registry.resolve(key);
      if (!r?.alias) return ctx.flag(key);
      if (r.condition !== null) return evaluate(r.condition, flagResolver(ctx.world.meta.flags));
      return registry.aliasView(r, ctx.flag(r.name));
    },
    setFlag(key: string, value: FlagValue): void {
      const ctx = running.ctx;
      const r = registry.resolve(key);
      if (!r || r.condition !== null) {
        if (policy === 'throw') throw new UnregisteredFlagError(key, running.system);
        if (policy === 'log') log(new UnregisteredFlagError(key, running.system).message);
        ctx.setFlag(key, value);
        return;
      }
      if (r.alias) ctx.setFlag(r.name, registry.canonicalWrite(r, value));
      else ctx.setFlag(key, registry.canonicalValue(key, value));
    },
  };
}

/**
 * Wrap the systems so every handler (init, tick, skip, commands, events) gets the guarded
 * context. Already guarded systems are returned as they are.
 */
export function guardSystems(
  systems: readonly GameSystem[],
  registry: FlagRegistry,
  policy: FlagPolicy = defaultFlagPolicy(),
  log: (msg: string) => void = (m) => console.warn(m),
): GameSystem[] {
  if (policy === 'off') return [...systems];
  const running = { system: '' } as Running;
  const guarded = guardedContext(running, registry, policy, log);
  const wrap = (ctx: SystemContext, system: string): SystemContext => {
    running.ctx = ctx;
    running.system = system;
    return guarded;
  };
  return systems.map((s) => {
    if ((s as Guarded)[GUARDED]) return s;
    const id = s.id;
    const out: Guarded = { ...s, [GUARDED]: true };
    if (s.init) {
      const init = s.init;
      out.init = (ctx) => init(wrap(ctx, id));
    }
    if (s.tick) {
      const tick = s.tick;
      out.tick = (ctx) => tick(wrap(ctx, id));
    }
    if (s.skip) {
      const skip = s.skip;
      out.skip = (ctx, step) => skip(wrap(ctx, id), step);
    }
    if (s.commands) {
      const commands: Record<string, unknown> = {};
      for (const [kind, h] of Object.entries(s.commands)) {
        const handler = h as (c: SystemContext, d: unknown, src: unknown) => unknown;
        commands[kind] = (ctx: SystemContext, d: unknown, src: unknown) =>
          handler(wrap(ctx, id), d, src);
      }
      out.commands = commands as GameSystem['commands'];
    }
    if (s.on) {
      const on: Record<string, unknown> = {};
      for (const [kind, h] of Object.entries(s.on)) {
        const handler = h as (c: SystemContext, e: unknown) => void;
        on[kind] = (ctx: SystemContext, e: unknown) => handler(wrap(ctx, id), e);
      }
      out.on = on as GameSystem['on'];
    }
    return out;
  });
}

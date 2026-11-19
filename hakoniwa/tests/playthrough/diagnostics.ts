// Test-only observation of long, synchronous playthroughs. It never queues commands,
// changes world state or alters the route's simulation/stall/acceptance budgets.
import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Engine } from '../../src/core';
import { serializeWorld } from '../../src/core';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../src/core/time';
import { attackers } from '../../src/game/autoplay';
import { unitView } from '../../src/systems/combat';
import { wornPieces } from '../../src/systems/inventory';
import { stateOf } from '../../src/systems/party/roster';
import { playerEntity } from '../../src/systems/world';

const MILESTONES = new Set([
  'act.changed',
  'quest.started',
  'quest.stage',
  'quest.completed',
  'player.level_up',
  'combat.player_returned',
  'scene.started',
]);

export function observePlaythrough(
  engine: Engine,
  intent: () => string,
  opts: {
    directory: string;
    intervalTicks?: number;
    checkpointTicks?: number;
    maxRecords?: number;
    log?: (line: string) => void;
  },
) {
  mkdirSync(opts.directory, { recursive: true });
  const maxRecords = Math.max(2, opts.maxRecords ?? 500);
  const interval = Math.max(1, opts.intervalTicks ?? 8 * TICKS_PER_GAME_HOUR);
  const checkpointInterval = Math.max(1, opts.checkpointTicks ?? TICKS_PER_GAME_DAY);
  const rejected: Record<string, number> = {};
  const recent: unknown[] = [];
  let nextRecord = engine.tick;
  let nextCheckpoint = engine.tick + checkpointInterval;
  let checkpointTick: number | null = null;
  let previousCheckpointTick: number | null = null;
  let written = 0;
  let finished = false;

  function snapshot(reason: string) {
    const w = engine.world;
    const player = playerEntity(w);
    const id = w.slices.world.playerId;
    const unit = w.slices.combat.units[id];
    const view = unitView(w, engine.content, id);
    return {
      observedAt: new Date().toISOString(),
      reason,
      tick: engine.tick,
      act: w.meta.flags.act,
      week: w.meta.flags.act_week,
      intent: intent(),
      player: player
        ? {
            mapId: player.mapId,
            x: player.x,
            y: player.y,
            alive: player.alive,
            level: unit?.level,
            hp: unit?.hp,
            maxHp: view?.maxHp,
            target: unit?.target,
            autoAttack: unit?.autoAttack,
            cast: unit?.cast,
            auras: unit?.auras,
            pendingReturn: w.slices.combat.pendingReturn,
            gear: wornPieces(w, engine.content, id).map((p) => ({
              slot: p.slot,
              itemId: p.def.id,
              instanceId: p.inst?.instanceId,
              working: p.working,
              durability: p.inst?.durability,
            })),
          }
        : null,
      attackers: attackers(w)
        .slice(0, 12)
        .map((targetId) => {
          const e = w.slices.world.entities[targetId];
          const u = w.slices.combat.units[targetId];
          return {
            id: targetId,
            ref: e?.ref,
            x: e?.x,
            y: e?.y,
            level: u?.level,
            hp: u?.hp,
            target: u?.target,
            attackable: u?.attackable,
            brain: u?.ai,
          };
        }),
      party: Object.values(w.slices.party.members)
        .slice(0, 12)
        .map((m) => ({
          id: m.id,
          entityId: m.entityId,
          state: stateOf(m),
          hp: w.slices.combat.units[m.entityId]?.hp,
          mapId: w.slices.world.entities[m.entityId]?.mapId,
        })),
      quests: Object.values(w.slices.quests.quests)
        .filter((q) => q.status === 'active' || q.status === 'ready')
        .slice(0, 24)
        .map((q) => ({ id: q.id, stage: q.stage, status: q.status, met: q.met, counts: q.counts })),
      rejected: { ...rejected },
      recent: [...recent],
    };
  }

  function record(reason: string, final = false) {
    if (written >= maxRecords - (final ? 0 : 1)) return;
    const data = snapshot(reason);
    appendFileSync(join(opts.directory, 'progress.jsonl'), `${JSON.stringify(data)}\n`, 'utf8');
    written++;
    opts.log?.(
      `[act1 progress] tick=${data.tick} act=${data.act} week=${data.week} map=${data.player?.mapId} hp=${data.player?.hp}/${data.player?.maxHp} ${data.intent}`,
    );
  }

  const unsubscribe = engine.onEvents((events) => {
    let milestone: string | undefined;
    for (const e of events) {
      if (e.kind === 'command.result' && !e.data.ok && e.data.source.type === 'player') {
        const key = `${e.data.kind}:${e.data.code ?? ''}`;
        rejected[key] = (rejected[key] ?? 0) + 1;
      }
      if (
        MILESTONES.has(e.kind) ||
        (e.kind === 'entity.died' && e.data.id === engine.world.slices.world.playerId)
      ) {
        milestone = e.kind;
        recent.push({ tick: e.tick, kind: e.kind, data: e.data });
        if (recent.length > 20) recent.shift();
      }
    }
    if (milestone || engine.tick >= nextRecord) {
      record(milestone ?? 'interval');
      nextRecord = engine.tick + interval;
    }
    if (engine.tick >= nextCheckpoint) {
      if (checkpointTick !== null) {
        copyFileSync(join(opts.directory, 'latest.hks'), join(opts.directory, 'previous.hks'));
        previousCheckpointTick = checkpointTick;
      }
      writeFileSync(join(opts.directory, 'latest.hks'), serializeWorld(engine.world), 'utf8');
      checkpointTick = engine.tick;
      nextCheckpoint = engine.tick + checkpointInterval;
    }
  });

  return {
    finish(status: 'passed' | 'failed', detail: unknown) {
      if (finished) return;
      finished = true;
      unsubscribe();
      record(status, true);
      writeFileSync(join(opts.directory, `${status}.hks`), serializeWorld(engine.world), 'utf8');
      // Copy the existing log; draining it here would make an observer change the run.
      writeFileSync(
        join(opts.directory, 'commands.json'),
        JSON.stringify(engine.world.log),
        'utf8',
      );
      writeFileSync(
        join(opts.directory, 'result.json'),
        JSON.stringify(
          {
            status,
            ...snapshot(status),
            detail,
            checkpointTick,
            previousCheckpointTick,
            logGap: engine.logGap,
            logFull: engine.logFull,
            commandCount: engine.world.log.length,
          },
          null,
          2,
        ),
        'utf8',
      );
    },
  };
}

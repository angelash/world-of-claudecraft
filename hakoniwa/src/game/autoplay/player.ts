// The autoplayer: a scripted player that plays the no-model build from the prologue to
// an ending with nothing but player commands (D-010 acceptance). Each decision reads the
// same views the client shows (scene, quest log, conversation, battle, settlement,
// continent, door corridor), queues at most a few commands, and says how many ticks to
// let the world run before the next look. Deterministic: no clock, no Math.random.

import type { CommandKind, CommandMap, FlagValue } from '../../core/contracts';
import type { Engine } from '../../core/engine';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { unitView, xpProgress } from '../../systems/combat';
import { currentConversation } from '../../systems/dialogue';
import { corridorView } from '../../systems/doors';
import { holdingOf } from '../../systems/inventory';
import { evaluate, flagResolver } from '../../systems/quests/conditions';
import type { Objective, QuestDef } from '../../systems/quests/types';
import { sceneView } from '../../systems/scenes';
import { pendingScenario } from '../../systems/warfare';
import { mapById, playerEntity } from '../../systems/world';
import type { Entity } from '../../systems/world/types';
import { DomainPlanner } from './domains';
import {
  attackers,
  engagedCost,
  fightCommands,
  friendlyIds,
  gapBetween,
  huntable,
  partyStrength,
  playerHasAura,
  playerHealth,
  playerMana,
  pullCost,
  unitLevel,
} from './fight';
import { gearUpgrade } from './goods';
import { insideLocation, locationPoint, nextLeg } from './nav';
import { type ChoicePolicy, type EndingRoute, scenePolicy } from './scene_policy';

export interface AutoplayOptions {
  route?: EndingRoute;
  /** progress lines (one per quest completed, one per act change, notable events) */
  log?: (line: string) => void;
  /** hard budget; the run stops and reports when it is spent */
  maxTicks?: number;
  /** ticks without story progress before the run is declared stuck */
  stallTicks?: number;
  /**
   * nation autonomy to reach before the last battle (default: 62 on the release route,
   * where the ending asks for 60, otherwise 0)
   */
  autonomyGoal?: number;
}

export interface ActRecord {
  act: string;
  startTick: number;
  endTick?: number;
}

export interface AutoplayResult {
  ending: string | null;
  finished: boolean;
  ticks: number;
  acts: ActRecord[];
  questsDone: string[];
  deaths: number;
  /** player commands the world rejected, by kind:code */
  rejected: Record<string, number>;
  /** player commands sent, by kind */
  commands: Record<string, number>;
  /** why the run stopped early, if it did */
  stuck?: string;
}

/** What the player is doing right now (for logs and stall reports). */
export interface Intent {
  what: string;
  /** a talk target and the conversation option wanted from them */
  talk?: { npc: string; option?: string };
}

type Cmd = { [K in CommandKind]: { kind: K; data: CommandMap[K] } }[CommandKind];

const THINK = 4;
const IDLE_STEP = 60;
const TALK_RANGE = 2.2;

export class Autoplayer {
  readonly route: EndingRoute;
  readonly autonomyGoal: number;
  private readonly defaults: { maxTicks?: number; stallTicks?: number };
  private readonly policy: ChoicePolicy;
  private readonly logFn: (line: string) => void;
  readonly acts: ActRecord[] = [];
  readonly questsDone: string[] = [];
  readonly rejected: Record<string, number> = {};
  /** every command the bot queued, by kind (all of them player commands) */
  readonly sent: Record<string, number> = {};
  deaths = 0;
  private lastProgressTick = 0;
  private moveGoal: { mapId: string; x: number; y: number; tick: number } | null = null;
  private lastPos = { x: 0, y: 0, mapId: '', tick: 0 };
  intent: Intent = { what: 'start' };
  private fightingRef: string | undefined;
  private fleeing = false;
  /** recent damage dealt by the party and taken by the player (for the flee decision) */
  private readonly ledger: { tick: number; dealt: number; taken: number }[] = [];
  private gearAt = -1_000_000;
  private readonly domains: DomainPlanner;
  private talkedAt: Record<string, number> = {};
  /** last tick a player command of each kind was rejected */
  private readonly rejectedAt: Record<string, number> = {};
  /** deaths suffered while fighting a named monster */
  readonly lossesTo: Record<string, number> = {};

  constructor(
    readonly engine: Engine,
    opts: AutoplayOptions = {},
  ) {
    this.route = opts.route ?? 'release';
    this.autonomyGoal = opts.autonomyGoal ?? (this.route === 'release' ? 62 : 0);
    this.defaults = { maxTicks: opts.maxTicks, stallTicks: opts.stallTicks };
    this.policy = scenePolicy(this.route, engine.world, engine.content);
    this.logFn = opts.log ?? (() => {});
    this.domains = new DomainPlanner(this);
    engine.onEvents((events) => {
      for (const e of events) {
        if (e.kind === 'quest.completed') {
          this.questsDone.push(e.data.questId);
          this.progress(`任务完成：${e.data.title}（${e.data.questId}）`);
        } else if (e.kind === 'act.changed') {
          const last = this.acts[this.acts.length - 1];
          if (last) last.endTick = e.tick;
          this.acts.push({ act: e.data.to, startTick: e.tick });
          this.progress(`换幕：${e.data.from} -> ${e.data.to}`);
        } else if (e.kind === 'command.result' && !e.data.ok && e.data.source.type === 'player') {
          const key = `${e.data.kind}:${e.data.code ?? ''}`;
          this.rejected[key] = (this.rejected[key] ?? 0) + 1;
          this.rejectedAt[e.data.kind] = e.tick;
        } else if (e.kind === 'entity.died' && e.data.id === engine.world.slices.world.playerId) {
          this.deaths++;
          const killerId = e.data.killerId;
          const killer = killerId ? engine.world.slices.world.entities[killerId] : undefined;
          const ref = this.fightingRef ?? killer?.ref;
          if (ref) this.lossesTo[ref] = (this.lossesTo[ref] ?? 0) + 1;
          this.log(`玩家倒下（${e.data.mapId}），从门里回来`);
        } else if (e.kind === 'combat.damage') {
          const friends = friendlyIds(engine.world);
          if (friends.has(e.data.sourceId) && !friends.has(e.data.targetId)) {
            this.ledger.push({ tick: e.tick, dealt: e.data.amount, taken: 0 });
          } else if (e.data.targetId === engine.world.slices.world.playerId) {
            this.ledger.push({ tick: e.tick, dealt: 0, taken: e.data.amount });
          }
          if (this.ledger.length > 400) this.ledger.splice(0, this.ledger.length - 400);
        } else if (
          e.kind === 'city.autonomy_changed' ||
          e.kind === 'city.population_changed' ||
          e.kind === 'player.level_up'
        ) {
          // the settlement growing or the player levelling is progress too (no log line)
          this.lastProgressTick = e.tick;
        } else if (e.kind === 'battle.ended') {
          this.progress(`战役结束：${e.data.scenario ?? ''} 胜方 ${e.data.victor}`);
        } else if (e.kind === 'door.opened') {
          this.log(`开门：${e.data.doorId}`);
        }
      }
    });
    const act = String(engine.world.meta.flags.act ?? 'prologue');
    this.acts.push({ act, startTick: engine.tick });
  }

  // -------------------------------------------------------------------------
  // helpers shared with the planners

  get world() {
    return this.engine.world;
  }

  get content() {
    return this.engine.content;
  }

  get flags(): Record<string, FlagValue> {
    return this.engine.world.meta.flags;
  }

  holds(cond: string | undefined): boolean {
    return evaluate(cond, flagResolver(this.flags, { ai_enabled: false }));
  }

  send(cmd: Cmd): void {
    this.sent[cmd.kind] = (this.sent[cmd.kind] ?? 0) + 1;
    this.engine.queue(cmd.kind, cmd.data as never);
  }

  /** Was a command of this kind rejected within the last `ticks` ticks? */
  recentlyRejected(kind: string, ticks: number): boolean {
    const at = this.rejectedAt[kind];
    return at !== undefined && this.engine.tick - at < ticks;
  }

  log(line: string): void {
    this.logFn(`[${this.engine.tick}] ${line}`);
  }

  private progress(line: string): void {
    this.lastProgressTick = this.engine.tick;
    this.log(line);
  }

  player(): Entity | undefined {
    return playerEntity(this.world);
  }

  // -------------------------------------------------------------------------
  // the run

  done(): boolean {
    return (
      this.flags.act === 'epilogue' &&
      this.flags.ending !== undefined &&
      !this.world.slices.scenes.current &&
      this.world.slices.scenes.queue.length === 0
    );
  }

  run(
    opts: { maxTicks?: number; stallTicks?: number; until?: (engine: Engine) => boolean } = {},
  ): AutoplayResult {
    const maxTicks = opts.maxTicks ?? this.defaults.maxTicks ?? 6_000_000;
    const stall = opts.stallTicks ?? this.defaults.stallTicks ?? 8 * 28800;
    const start = this.engine.tick;
    this.lastProgressTick = start;
    let stuck: string | undefined;
    while (!this.done()) {
      if (opts.until?.(this.engine)) break;
      if (this.engine.tick - start >= maxTicks) {
        stuck = `budget spent while: ${this.intent.what}`;
        break;
      }
      if (this.engine.tick - this.lastProgressTick > stall) {
        stuck = `no progress for ${stall} ticks while: ${this.intent.what}`;
        break;
      }
      const ticks = this.think();
      this.engine.step(Math.max(1, ticks));
    }
    const last = this.acts[this.acts.length - 1];
    if (last && last.endTick === undefined && this.done()) last.endTick = this.engine.tick;
    if (stuck) this.log(`停止：${stuck}`);
    return {
      ending: this.flags.ending === undefined ? null : String(this.flags.ending),
      finished: this.done(),
      ticks: this.engine.tick - start,
      acts: this.acts.map((a) => ({ ...a })),
      questsDone: [...this.questsDone],
      deaths: this.deaths,
      rejected: { ...this.rejected },
      commands: { ...this.sent },
      stuck,
    };
  }

  /** One decision. Returns how many ticks to run before the next one. */
  think(): number {
    const sv = sceneView(this.world, this.content);
    if (sv) return this.playScene(sv);
    const domain = this.domains.urgent();
    if (domain !== null) return domain;
    const p = this.player();
    if (!p) return IDLE_STEP;
    if (p.mapId === 'inner_court') {
      this.intent = { what: 'leave the inner court' };
      this.send({ kind: 'city.leave_court', data: {} });
      return THINK;
    }
    // fight back whatever is attacking the party
    const foes = attackers(this.world);
    if (foes.length > 0) {
      const hp = playerHealth(this.world, this.content);
      const weight = engagedCost(this.world, this.content);
      if (this.fleeing || (hp < 0.5 && weight > 0.4 && this.losingRace(foes))) {
        const fled = this.flee();
        if (fled !== null) return fled;
      }
      return this.fight(this.weakest(foes), 'defend');
    }
    this.fleeing = false;
    // conversation leftovers
    const conv = currentConversation(this.world);
    if (conv && !conv.pending && this.intent.talk?.npc !== conv.npcRef) {
      this.send({ kind: 'dialogue.close', data: {} });
      return 1;
    }
    // rest when hurt, tired from a return through the door, or low on mana
    if (this.needsRest()) return this.rest('rest');
    // put on anything better that came with the loot
    if (this.engine.tick - this.gearAt >= 400) {
      this.gearAt = this.engine.tick;
      const pid = this.world.slices.world.playerId;
      const up = gearUpgrade(
        this.content,
        holdingOf(this.world, pid),
        xpProgress(this.world).level,
      );
      if (up) {
        this.intent = { what: `equip ${up}` };
        this.send({ kind: 'inventory.equip', data: { ownerId: pid, itemId: up } });
        return 2;
      }
    }
    // monsters about to notice us: take them one at a time on our terms
    const strength = partyStrength(this.world);
    const close = huntable(this.world, (e) => e.kind === 'monster', 3).filter((id) => {
      const e = this.world.slices.world.entities[id];
      const pull = pullCost(this.world, id);
      return (
        !!e && Math.hypot(e.x - p.x, e.y - p.y) <= 5.5 && pull <= strength && this.fitFor(pull)
      );
    });
    if (close.length > 0) return this.fight(close[0] as string, 'clear the way');
    const doors = this.openDoors();
    if (doors !== null) return doors;
    const now = this.domains.now();
    if (now !== null) return now;
    const quest = this.pursueQuests();
    if (quest >= 0) return quest;
    const background = this.domains.background(-quest);
    if (background !== null) return background;
    return this.wait(-quest);
  }

  /** Let time pass: big steps when nothing hostile is near, small ones otherwise. */
  wait(ticks: number): number {
    const p = this.player();
    this.stopMoving();
    if (!p) return IDLE_STEP;
    const danger = huntable(this.world, (e) => e.kind === 'monster').some((id) => {
      const e = this.world.slices.world.entities[id];
      return !!e && Math.hypot(e.x - p.x, e.y - p.y) <= 14;
    });
    // a long safe wait: the companions stand down (and stop scanning for fights)
    if (!danger && ticks >= TICKS_PER_GAME_HOUR) this.partyOrder('passive');
    return Math.max(1, Math.min(ticks, danger ? IDLE_STEP : TICKS_PER_GAME_HOUR));
  }

  /** Give the companions an order once (they keep it until told otherwise). */
  partyOrder(order: 'assist' | 'passive'): void {
    const members = Object.values(this.world.slices.party?.members ?? {});
    if (members.length === 0 || members.every((m) => m.order === order)) return;
    this.send({ kind: 'party.order', data: { order } });
  }

  // -------------------------------------------------------------------------
  // scenes

  private playScene(sv: NonNullable<ReturnType<typeof sceneView>>): number {
    this.intent = { what: `scene ${sv.sceneId}/${sv.nodeId}` };
    if (sv.waiting === 'choice' || sv.waiting === 'court') {
      const ids = sv.choices.map((c) => c.id);
      if (ids.length === 0) return 1;
      const pick = this.policy(sv.sceneId, sv.nodeId, ids);
      this.send({ kind: 'scenes.choose', data: { choiceId: pick } });
    } else if (sv.waiting === 'input') {
      this.send({ kind: 'scenes.input', data: { text: '' } });
    } else if (sv.waiting === 'advance') {
      this.send({ kind: 'scenes.advance', data: {} });
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // doors

  private openDoors(): number | null {
    for (const d of corridorView(this.world, this.content)) {
      if (d.state !== 'openable' || d.danger) continue;
      this.intent = { what: `open door ${d.id}` };
      this.send({ kind: 'doors.open', data: { doorId: d.id } });
      return 1;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // movement

  stopMoving(): void {
    const p = this.player();
    if (p?.move) this.send({ kind: 'world.stop', data: { entityId: p.id } });
    this.moveGoal = null;
  }

  /**
   * Walk toward a point on any map (through exits). Returns 'here' when within radius,
   * 'walking' while on the way and 'blocked' when no route exists.
   */
  walkTo(mapId: string, x: number, y: number, radius = 1): 'here' | 'walking' | 'blocked' {
    const p = this.player();
    if (!p) return 'blocked';
    if (p.mapId !== mapId) {
      const leg = nextLeg(this.content.maps, this.flags, p.mapId, mapId);
      if (!leg) return 'blocked';
      const ex = leg.exit.x + 0.5;
      const ey = leg.exit.y + 0.5;
      if (Math.hypot(ex - p.x, ey - p.y) <= 1.5) {
        this.send({ kind: 'world.use_exit', data: { entityId: p.id, exitId: leg.exit.id } });
        this.moveGoal = null;
        return 'walking';
      }
      this.moveOnMap(ex, ey);
      return 'walking';
    }
    if (Math.hypot(x - p.x, y - p.y) <= radius) {
      if (p.move && Math.hypot(x - p.x, y - p.y) <= radius * 0.5) this.stopMoving();
      return 'here';
    }
    this.moveOnMap(x, y);
    return 'walking';
  }

  private moveOnMap(x: number, y: number): void {
    const p = this.player();
    if (!p) return;
    const g = this.moveGoal;
    const tick = this.engine.tick;
    const same = g && g.mapId === p.mapId && Math.hypot(g.x - x, g.y - y) < 0.8;
    const stalled =
      this.lastPos.mapId === p.mapId &&
      Math.hypot(this.lastPos.x - p.x, this.lastPos.y - p.y) < 0.05 &&
      tick - this.lastPos.tick >= THINK;
    this.lastPos = { x: p.x, y: p.y, mapId: p.mapId, tick };
    if (same && p.move && !stalled) return;
    if (same && !p.move && tick - (g?.tick ?? 0) < 8) return;
    this.send({ kind: 'world.move_to', data: { entityId: p.id, x, y } });
    this.moveGoal = { mapId: p.mapId, x, y, tick };
  }

  // -------------------------------------------------------------------------
  // fighting

  fight(targetId: string, why: string): number {
    const p = this.player();
    const t = this.world.slices.world.entities[targetId];
    if (!p || !t) return THINK;
    this.intent = { what: `fight ${t.ref ?? t.id} (${why})` };
    this.fightingRef = t.ref;
    this.partyOrder('assist');
    const conv = currentConversation(this.world);
    if (conv) this.send({ kind: 'dialogue.close', data: {} });
    const gap = gapBetween(p, t);
    if (gap > 0.9) this.walkTo(t.mapId, t.x, t.y, 0.5);
    else if (p.move) this.stopMoving();
    for (const c of fightCommands(this.world, this.content, targetId)) {
      this.send(c as Cmd);
    }
    return THINK;
  }

  /**
   * Will the player fall before the attackers do? Compares the party's recent damage
   * rate against the attackers' remaining health, and the damage taken against the
   * player's own health (the last five seconds of the fight).
   */
  private losingRace(foes: string[]): boolean {
    const since = this.engine.tick - 100;
    let dealt = 0;
    let taken = 0;
    for (const r of this.ledger) {
      if (r.tick < since) continue;
      dealt += r.dealt;
      taken += r.taken;
    }
    if (taken <= 0) return false;
    const units = this.world.slices.combat.units;
    const me = units[this.world.slices.world.playerId];
    const myHp = me?.hp ?? 0;
    const toDie = myHp / taken;
    if (dealt <= 0) return true;
    // the target we are on falls first: stay (a boss's adds matter less once it is down)
    const target = me?.target ? units[me.target] : undefined;
    if (target && foes.includes(target.id) && (target.hp / dealt) * 1.1 < toDie) return false;
    let foeHp = 0;
    for (const id of foes) foeHp += units[id]?.hp ?? 0;
    return toDie < (foeHp / dealt) * 1.15;
  }

  /** Run for the nearest exit: a new map drops every pursuer. Null when there is none. */
  private flee(): number | null {
    const p = this.player();
    const map = p ? mapById(this.content, p.mapId) : undefined;
    if (!p || !map) return null;
    const exits = map.exits
      .filter((x) => !x.requiresFlags?.some((f) => !this.flags[f]))
      .map((x) => ({ x, d: Math.hypot(x.x + 0.5 - p.x, x.y + 0.5 - p.y) }))
      .sort((a, b) => a.d - b.d);
    const exit = exits[0];
    if (!exit || exit.d > 25) return null;
    this.fleeing = true;
    this.intent = { what: `flee through ${exit.x.id}` };
    this.send({ kind: 'combat.stop', data: {} });
    if (exit.d <= 1.5) {
      this.send({ kind: 'world.use_exit', data: { entityId: p.id, exitId: exit.x.id } });
      this.fleeing = false;
      return 2;
    }
    this.moveOnMap(exit.x.x + 0.5, exit.x.y + 0.5);
    return 2;
  }

  /** Hunt monsters matching an objective on a map (or anywhere suitable). */
  hunt(o: Extract<Objective, { type: 'kill' }>, why: string): number {
    const p = this.player();
    if (!p) return IDLE_STEP;
    const refs = o.refs ?? (o.ref ? [o.ref] : null);
    const kind = o.kind ?? 'monster';
    const match = (e: Entity) => (refs ? !!e.ref && refs.includes(e.ref) : e.kind === kind);
    const mapId = o.mapId ?? this.huntingMap(refs);
    if (!mapId) {
      this.intent = { what: `${why}: no map to hunt in` };
      return IDLE_STEP;
    }
    if (p.mapId !== mapId) {
      this.intent = { what: `${why}: travel to ${mapId}` };
      const map = mapById(this.content, mapId);
      const pt = map ? locationPoint(map) : { x: 1, y: 1 };
      this.walkTo(mapId, pt.x, pt.y, 3);
      return THINK;
    }
    const level = xpProgress(this.world).level;
    const gapAllowed = refs ? Number.POSITIVE_INFINITY : 3;
    const strength = partyStrength(this.world);
    const all = huntable(this.world, match, gapAllowed);
    const cheapest = all.reduce((m, id) => Math.min(m, pullCost(this.world, id)), Infinity);
    const limit = Math.max(strength, cheapest + 0.05);
    const found = all.filter((id) => !!refs || pullCost(this.world, id) <= limit);
    if (found.length > 0) {
      const target = found[0] as string;
      if (!refs && !this.fitFor(pullCost(this.world, target))) {
        return this.rest(`${why}: rest before the next pull`);
      }
      return this.fight(target, why);
    }
    // nothing alive here: walk to the spawn that holds them and wait for a respawn
    const map = mapById(this.content, mapId);
    const spawn = map?.spawns.find(
      (s) => s.kind === 'monster' && (refs ? refs.includes(s.ref) : true),
    );
    this.intent = { what: `${why}: waiting for monsters on ${mapId} (Lv${level})` };
    if (spawn) {
      if (this.walkTo(mapId, spawn.x + 0.5, spawn.y + 0.5, 2) === 'here') return 40;
      return THINK;
    }
    return IDLE_STEP;
  }

  private huntingMap(refs: string[] | null): string | null {
    const p = this.player();
    if (!p) return null;
    if (refs) {
      for (const e of Object.values(this.world.slices.world.entities)) {
        if (e.alive && e.ref && refs.includes(e.ref) && e.kind === 'monster') return e.mapId;
      }
      for (const m of this.content.maps) {
        if (m.spawns.some((s) => s.kind === 'monster' && refs.includes(s.ref))) return m.id;
      }
      return null;
    }
    const here = mapById(this.content, p.mapId);
    if (here?.spawns.some((s) => s.kind === 'monster')) return p.mapId;
    const order = ['forest_edge', 'seal_ruins', 'wallenburg_sewers', 'ash_waste'];
    for (const id of order) {
      if (nextLeg(this.content.maps, this.flags, p.mapId, id)) return id;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // talking

  /** Walk to an NPC and open a conversation; pick the wanted option once offered. */
  talk(npc: string, option: string | undefined, why: string): number {
    this.intent = { what: why, talk: { npc, option } };
    const conv = currentConversation(this.world);
    if (conv && conv.npcRef === npc) {
      if (conv.pending) return THINK;
      if (option) {
        const opt = conv.options.find((o) => o.id === option);
        if (opt) {
          this.send({ kind: 'dialogue.choose', data: { optionId: opt.id } });
          this.talkedAt[`${npc}:${option}`] = this.engine.tick;
          return 2;
        }
      }
      this.send({ kind: 'dialogue.close', data: {} });
      this.talkedAt[npc] = this.engine.tick;
      return 2;
    }
    const e = this.findNpc(npc);
    if (!e) {
      this.intent = { what: `${why}: ${npc} is nowhere to be seen` };
      return IDLE_STEP;
    }
    const p = this.player();
    if (p && e.mapId === p.mapId && Math.hypot(e.x - p.x, e.y - p.y) <= TALK_RANGE) {
      this.stopMoving();
      this.send({ kind: 'dialogue.talk', data: { npcId: e.id } });
      return 2;
    }
    this.walkTo(e.mapId, e.x, e.y, 1.2);
    return THINK;
  }

  /** A merchant on a map (by NPC ref), nearest to the player first. */
  nearestMerchant(mapId: string): string | null {
    const p = this.player();
    let best: { ref: string; d: number } | null = null;
    for (const e of Object.values(this.world.slices.world.entities)) {
      if (e.kind !== 'npc' || e.mapId !== mapId || !e.alive || e.hidden || !e.ref) continue;
      if (!e.tags.includes('merchant')) continue;
      const d = p && p.mapId === mapId ? Math.hypot(e.x - p.x, e.y - p.y) : 0;
      if (!best || d < best.d || (d === best.d && e.ref < best.ref)) best = { ref: e.ref, d };
    }
    return best?.ref ?? null;
  }

  findNpc(ref: string): Entity | undefined {
    for (const e of Object.values(this.world.slices.world.entities)) {
      if (e.kind === 'npc' && e.ref === ref && e.alive && !e.hidden) return e;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // quests

  private questDef(id: string): QuestDef | undefined {
    return this.content.quests.find((q) => q.id === id);
  }

  /** Quest work: ticks to step (>= 0), or minus the ticks worth waiting when nothing is actionable. */
  private pursueQuests(): number {
    const slice = this.world.slices.quests;
    const mainFirst = (a: QuestDef, b: QuestDef) =>
      (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1);
    // 1. turn in what is ready
    for (const id of slice.order) {
      const q = slice.quests[id];
      const def = this.questDef(id);
      if (q?.status === 'ready' && def?.turnIn) {
        return this.talk(def.turnIn, `quests:turnin:${id}`, `turn in ${id}`);
      }
    }
    // 2. accept main quests on offer
    const offers = this.content.quests
      .filter((d) => d.giver && d.kind === 'main' && !slice.quests[d.id] && this.holds(d.trigger))
      .sort(mainFirst);
    for (const def of offers) {
      return this.talk(def.giver as string, `quests:accept:${def.id}`, `accept ${def.id}`);
    }
    // 3. work on the active main quests, in start order
    let waiting: number | null = null;
    for (const id of slice.order) {
      const q = slice.quests[id];
      const def = this.questDef(id);
      if (!q || !def || q.status !== 'active' || def.kind !== 'main') continue;
      const stage = def.stages[q.stage];
      if (!stage) continue;
      const open = stage.objectives
        .map((o, i) => ({ o, i }))
        .filter(({ o, i }) => !q.met[i] && !o.optional);
      const ordered =
        stage.complete === 'any' ? [...open].sort((a, b) => cost(a.o) - cost(b.o)) : open;
      for (const { o } of ordered) {
        const r = this.objective(def, o);
        if (r === null) continue;
        if (r < 0) {
          waiting = waiting === null ? -r : Math.min(waiting, -r);
          continue;
        }
        return r;
      }
    }
    if (waiting !== null) return -waiting;
    this.intent = { what: 'idle' };
    return -IDLE_STEP;
  }

  /**
   * Work on one objective. Returns ticks to step, a negative number for "nothing to do
   * but wait this long", or null when the objective is not actionable by the player.
   */
  private objective(def: QuestDef, o: Objective): number | null {
    const why = `${def.id}: ${o.label}`;
    switch (o.type) {
      case 'reach': {
        const map = mapById(this.content, o.mapId);
        if (!map) return null;
        const pt = locationPoint(map, o.location);
        this.intent = { what: why };
        const p = this.player();
        if (p && p.mapId === o.mapId && (!o.location || insideLocation(map, o.location, p))) {
          return -20;
        }
        return this.walkTo(o.mapId, pt.x, pt.y, 0.6) === 'blocked' ? null : THINK;
      }
      case 'talk': {
        const last = this.talkedAt[o.npc] ?? -1e9;
        if (this.engine.tick - last < 40) return -20;
        return this.talk(o.npc, undefined, why);
      }
      case 'kill': {
        if (o.ref && this.holds(o.orWhen)) return -20;
        const named = o.ref ?? (o.refs?.length === 1 ? o.refs[0] : undefined);
        if (named && !this.readyFor(named)) return this.grind(`${why} (not ready)`);
        if (named && !this.fitFor(3) && attackers(this.world).length === 0) {
          return this.rest(`${why}: rest to full before the fight`);
        }
        return this.hunt(o, why);
      }
      case 'choice': {
        const opt = o.options[0];
        if (!opt) return null;
        if (o.npc) return this.talk(o.npc, `quests:choice:${def.id}:${opt.id}`, why);
        this.intent = { what: why };
        this.send({ kind: 'quests.choose', data: { questId: def.id, optionId: opt.id } });
        return 2;
      }
      case 'wait': {
        this.intent = { what: why };
        return -TICKS_PER_GAME_HOUR;
      }
      case 'scene':
      case 'flag':
      case 'battle':
      case 'build':
      case 'door':
      case 'collect':
        this.intent = { what: `${why} (waiting on ${o.type})` };
        return -TICKS_PER_GAME_HOUR;
      case 'level':
        return this.grind(why);
    }
    return null;
  }

  /**
   * Rest out of reach: with hostiles idling nearby (a boss on its perch, a pack around a
   * corner), first walk back to the nearest way out of the map, then wait.
   */
  rest(why: string): number {
    const p = this.player();
    this.intent = { what: why };
    if (!p) return 40;
    const danger = huntable(this.world, (e) => e.kind === 'monster', 6).some((id) => {
      const e = this.world.slices.world.entities[id];
      return !!e && Math.hypot(e.x - p.x, e.y - p.y) <= 9;
    });
    const map = mapById(this.content, p.mapId);
    if (danger && map && map.exits.length > 0) {
      const exit = [...map.exits].sort(
        (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      )[0];
      if (exit && Math.hypot(exit.x + 0.5 - p.x, exit.y + 0.5 - p.y) > 2.5) {
        this.intent = { what: `${why} (backing off)` };
        this.moveOnMap(exit.x + 0.5, exit.y + 0.5);
        return THINK;
      }
    }
    this.stopMoving();
    return 40;
  }

  /** Out of combat and not fit to start a fight. */
  needsRest(): boolean {
    if (playerHealth(this.world, this.content) < 0.6) return true;
    if (playerHasAura(this.world, 'door_fatigue')) return true;
    return playerMana(this.world, this.content) < 0.4;
  }

  /** Healthy enough to start a fight of this weight (pullCost units)? */
  fitFor(cost: number): boolean {
    return playerHealth(this.world, this.content) >= Math.min(0.95, 0.45 + 0.25 * cost);
  }

  /** Of several attackers, the one closest to dying (fewer swings at us sooner). */
  private weakest(ids: string[]): string {
    let best = ids[0] as string;
    let bestFrac = Number.POSITIVE_INFINITY;
    for (const id of ids.slice(0, 4)) {
      const v = unitView(this.world, this.content, id);
      const frac = v && v.maxHp > 0 ? v.hp / v.maxHp : 1;
      if (frac < bestFrac - 0.05) {
        best = id;
        bestFrac = frac;
      }
    }
    return best;
  }

  /** Level the player wants before taking on this monster (bosses need a margin). */
  readyFor(ref: string): boolean {
    // story bosses meet the party at its own level (mechanics.partySync): no grind helps
    const def = this.content.monsters.find((m) => m.id === ref);
    if (def?.mechanics?.partySync) return true;
    let level = 0;
    for (const e of Object.values(this.world.slices.world.entities)) {
      if (e.ref === ref && e.kind === 'monster' && e.alive) {
        level = Math.max(level, unitLevel(this.world, e.id));
      }
    }
    if (level === 0) return true;
    // an outsider alone needs a clear margin over a boss and its adds; companions close it
    const party = Object.keys(this.world.slices.party?.members ?? {}).length;
    const margin = Math.max(-2, 4 - 2 * party);
    const losses = this.lossesTo[ref] ?? 0;
    return xpProgress(this.world).level >= level + margin + Math.min(losses, 4);
  }

  /** Gain experience on the best nearby hunting ground for the player's level. */
  grind(why: string): number {
    const p = this.player();
    if (!p) return IDLE_STEP;
    const me = xpProgress(this.world).level;
    const fit = (lvl: number) => lvl <= me + 1 && lvl >= me - 5;
    // what the party can take: its strength, or the lightest pull around when nothing
    // that light exists (pairs everywhere early on), taken only at full health
    const strength = partyStrength(this.world);
    const pulls = new Map<string, { cost: number; n: number }>();
    for (const u of Object.values(this.world.slices.combat.units)) {
      const e = this.world.slices.world.entities[u.id];
      if (!e || e.kind !== 'monster' || !e.alive || u.side !== 'enemy' || !fit(u.level)) continue;
      if (!u.attackable || u.ai?.state === 'yielded') continue;
      const c = pullCost(this.world, u.id);
      const cur = pulls.get(e.mapId);
      if (!cur) pulls.set(e.mapId, { cost: c, n: 1 });
      else {
        cur.cost = Math.min(cur.cost, c);
        cur.n++;
      }
    }
    let best: { id: string; cost: number; score: number } | null = null;
    for (const [id, v] of [...pulls].sort((a, b) => a[0].localeCompare(b[0]))) {
      const hops =
        id === p.mapId ? 0 : (nextLeg(this.content.maps, this.flags, p.mapId, id)?.hops ?? 99);
      if (hops >= 99) continue;
      const score = Math.max(v.cost, strength * 0.8) * 4 + hops - Math.min(v.n, 8) * 0.25;
      if (!best || score < best.score) best = { id, cost: v.cost, score };
    }
    if (!best) {
      this.intent = { what: `${why}: no prey for Lv${me}` };
      return IDLE_STEP;
    }
    const limit = Math.max(strength, best.cost + 0.05);
    if (best.id === p.mapId) {
      const here = huntable(this.world, (e, u) => e.kind === 'monster' && fit(u.level)).filter(
        (id) => pullCost(this.world, id) <= limit,
      );
      const target = here[0];
      if (!target) {
        this.intent = { what: `${why}: waiting for prey Lv${me}` };
        return IDLE_STEP;
      }
      if (!this.fitFor(pullCost(this.world, target))) {
        return this.rest(`${why}: rest before the next pull`);
      }
      return this.fight(target, `${why}: grind Lv${me}`);
    }
    this.intent = { what: `${why}: travel to ${best.id} to grind Lv${me}` };
    const map = mapById(this.content, best.id);
    const pt = map ? locationPoint(map) : { x: 1, y: 1 };
    this.walkTo(best.id, pt.x, pt.y, 3);
    return THINK;
  }

  /** The player's unit view (for planners). */
  me() {
    return unitView(this.world, this.content, this.world.slices.world.playerId);
  }

  pendingWar(): { id: string; scale: string } | null {
    return pendingScenario(this.world, this.content);
  }
}

/** Rough effort of an objective, used to pick one in an "any" stage. */
function cost(o: Objective): number {
  switch (o.type) {
    case 'flag':
    case 'scene':
      return 0;
    case 'reach':
      return 1;
    case 'talk':
      return 2;
    case 'choice':
      return 2;
    case 'kill':
      return 5;
    case 'wait':
      return 8;
    default:
      return 6;
  }
}

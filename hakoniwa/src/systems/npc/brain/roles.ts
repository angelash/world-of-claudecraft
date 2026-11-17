// The duty layer (builtin_ai.md 4.3 "[职责] usel(角色子树 1, 2, 3)"): a person's functional
// role trees under one utility selector, run by the shared behavior-tree runner. One
// runner per role set is cached per content; each person's runner state (the decorator
// history: cooldown, once, throttle, and any running branch) is restored before a tick and
// snapshotted after it into the person's brain state, so it survives save and load.
// An act leaf applies a role action at once (its receipt is immediate success): the
// action becomes the layer's decision; a say leaf barks; the usel scores each role tree by
// the utility of its first branch whose conditions hold now.

import { Blackboard, type BtEnv, type BtNodeDef, BtRunner } from '../../../core/brain/bt';
import { clampPersona } from '../../../core/brain/utility';
import type { ContentMap } from '../../../core/contracts';
import { personaDim } from '../traits';
import type { FunctionalRole } from '../types';
import { bark } from './barks';
import type { RoleActionSpec, RoleSpec } from './library';
import { holdsExpr } from './predicates';
import { sayToPlayer } from './speech';
import type { ActorView } from './view';

/** The layer's outcome: the role action chosen (if any), and whether a line was said. */
export interface DutyOutcome {
  action: { role: FunctionalRole; id: string; spec: RoleActionSpec } | null;
  said: boolean;
}

const runnerCache = new WeakMap<object, Map<string, BtRunner>>();

/** The composite duty tree of a role set: a usel over the role trees, in card order. */
function dutyTree(brain: ContentMap['npcBrain'], roles: readonly FunctionalRole[]): BtNodeDef {
  return {
    id: 'duty',
    type: 'usel',
    children: roles.map((r) => brain.roles[r]?.tree).filter((t): t is BtNodeDef => !!t),
  };
}

function runnerFor(content: ContentMap, roles: readonly FunctionalRole[]): BtRunner | null {
  const brain = content.npcBrain;
  if (!brain || roles.length === 0) return null;
  let byKey = runnerCache.get(brain);
  if (!byKey) {
    byKey = new Map();
    runnerCache.set(brain, byKey);
  }
  const key = roles.join(',');
  let r = byKey.get(key);
  if (!r) {
    const tree = dutyTree(brain, roles);
    if ((tree.children ?? []).length === 0) return null;
    r = new BtRunner(tree);
    byKey.set(key, r);
  }
  return r;
}

/** The role a top-level role tree belongs to (its id is `<role>.root`). */
function roleOfTree(node: BtNodeDef): FunctionalRole {
  return node.id.slice(0, node.id.indexOf('.')) as FunctionalRole;
}

/** The first act a subtree would reach with its conditions holding now (decorators aside). */
function firstReachable(v: ActorView, node: BtNodeDef): string | null {
  switch (node.type) {
    case 'act':
      return node.arg ?? null;
    case 'cond':
      return null;
    case 'deco':
      if (node.deco === 'guard' && !holdsExpr(v, node.arg ?? '')) return null;
      return node.children?.[0] ? firstReachable(v, node.children[0]) : null;
    case 'seq': {
      for (const c of node.children ?? []) {
        if (c.type === 'cond') {
          if (!holdsExpr(v, c.arg ?? '')) return null;
          continue;
        }
        const hit = firstReachable(v, c);
        if (hit) return hit;
        if (c.type === 'act') return c.arg ?? null;
      }
      return null;
    }
    default:
      for (const c of node.children ?? []) {
        const hit = firstReachable(v, c);
        if (hit) return hit;
      }
      return null;
  }
}

/** Utility of a role action: weight times the persona multipliers (builtin_ai 2.1 M(a)). */
export function roleActionScore(v: ActorView, spec: RoleActionSpec): number {
  let m = 1;
  for (const dim of spec.persona ?? [])
    m *= personaDim(v.ctx.content.npcBrain?.traitDims, v.p, dim);
  return spec.weight * clampPersona(m);
}

/**
 * Run the duty layer for the actor once (builtin_ai.md 4.3). `act` records the chosen role
 * action without side effects; the caller applies it with the rest of the decision.
 */
export function runDuty(v: ActorView): DutyOutcome {
  const roles = (v.p?.roles ?? []) as FunctionalRole[];
  const content = v.ctx.content;
  const runner = runnerFor(content, roles);
  const out: DutyOutcome = { action: null, said: false };
  if (!runner) return out;
  const specs = content.npcBrain.roles;
  const specOf = (role: FunctionalRole): RoleSpec | undefined => specs[role];
  // which role an act leaf belongs to: find it by walking the act's id prefix
  const env: BtEnv = {
    tick: v.ctx.tick,
    rng: v.ctx.rng(`npc.brain.${v.st.id}`),
    cond: (expr) => holdsExpr(v, expr),
    act: (command, node) => {
      if (out.action) return null;
      const role = node.id.slice(0, node.id.indexOf('.')) as FunctionalRole;
      const spec = specOf(role)?.actions[command];
      if (!spec) return null;
      out.action = { role, id: command, spec };
      return `${role}:${command}`;
    },
    receipt: () => 'success',
    say: (slot) => {
      if (slot.startsWith('bark.')) {
        if (bark(v.ctx, v.st, slot.slice(5))) out.said = true;
        return true;
      }
      // a line to the player (react.*): said only when the player is there to hear it
      if (sayToPlayer(v.ctx, v.st, slot)) out.said = true;
      return true;
    },
    score: (node) => {
      const role = roleOfTree(node);
      const actId = firstReachable(v, node);
      const spec = actId ? specOf(role)?.actions[actId] : undefined;
      return spec ? roleActionScore(v, spec) : 0;
    },
  };
  const key = 'duty';
  runner.restore(v.brain.bt[key]);
  runner.tick(env, new Blackboard());
  const snap = runner.snapshot();
  if (Object.keys(snap.run).length === 0 && Object.keys(snap.keep).length === 0)
    delete v.brain.bt[key];
  else v.brain.bt[key] = snap;
  return out;
}

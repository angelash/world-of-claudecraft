// The party's command handlers (companions_and_party.md 17.3): stances, tactical orders and
// the formation (7.2, 7.3, 3.3), gifts (8.4), the roster moves (2.5, 3.2: invite, stand by,
// swap, wait at a gate), the one-way ironman switch (11.4), the story's hooks (a personal
// line segment, a scripted grave injury, a reconciliation after the cold), taming and the
// pact (thousand_doors.md 15.1, 15.2) and riding. Every refusal is a text key.

import { ok, reject } from '../../core';
import type { CommandMap, CommandSource } from '../../core/contracts';
import type { CommandHandler, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { liveUnit } from '../combat';
import { countItem, itemDef, removeItem } from '../inventory';
import { getEntity, playerEntity } from '../world';
import { addBond, giftCounts, giftValue } from './bond';
import { companionDef, partyConfig } from './config';
import { ironmanOff } from './ironman';
import { ride } from './mounts';
import { pact, release, tame } from './pets';
import {
  enterParty,
  fieldMembers,
  hasFreeSlot,
  recruitable,
  rejectText,
  setState,
  standBy,
  stateOf,
} from './roster';
import { completeSegment } from './story';
import { type Member, STANCES, TACTICS, type TacticKind } from './types';
import { fall, partyFighting } from './wounds';

/** The story's commands come from systems and scripts, never from the player or a model. */
const STORY_SOURCES = new Set<CommandSource['type']>(['system', 'script']);

const no = (code: string) => reject(code, rejectText(code));

function member(ctx: SystemContext, id: string | undefined): Member | undefined {
  return id ? ctx.world.slices.party.members[id] : undefined;
}

/** Members a party-wide order reaches: in the field, not temporary. */
function orderable(ctx: SystemContext): Member[] {
  return fieldMembers(ctx.world).filter((m) => !m.temp);
}

type Handlers = { [K in keyof CommandMap]?: CommandHandler<K> };

export const commands: Handlers = {
  'party.order'(ctx, d) {
    if (!STANCES.includes(d.order)) return reject('bad_order', tr('sys.party.reject.bad_order'));
    const list = d.companionId ? [member(ctx, d.companionId)] : orderable(ctx);
    if (list.length === 0 || !list[0] || list[0].temp)
      return reject('no_companion', tr('sys.party.reject.no_companion'));
    for (const m of list) {
      if (!m) continue;
      m.order = d.order;
      const e = getEntity(ctx.world, m.entityId);
      if (d.order === 'stay' && e) m.stayAt = { mapId: e.mapId, x: e.x, y: e.y };
      else delete m.stayAt;
      ctx.emit('party.order', { companionId: m.id, order: d.order });
    }
    return ok();
  },

  'party.gift'(ctx, d) {
    const m = member(ctx, d.companionId);
    const def = companionDef(ctx.content, d.companionId);
    if (!m || !def || m.temp) return reject('no_companion', tr('sys.party.reject.no_companion'));
    // a gift is handed over in person (16: dragged onto the frame of a companion at hand)
    const at = stateOf(m);
    if (at !== 'party' && at !== 'waiting') return no('not_in_party');
    const item = itemDef(ctx.content, d.itemId);
    const pid = ctx.world.slices.world.playerId;
    if (!item) return reject('no_item', tr('sys.party.reject.no_item'));
    if (item.kind === 'key' || item.kind === 'evidence' || item.tags?.includes('mount'))
      return reject('not_giftable', tr('sys.party.reject.not_giftable'));
    if (countItem(ctx.world, pid, d.itemId) <= 0)
      return reject('missing', tr('sys.party.reject.missing'));
    removeItem(ctx, pid, d.itemId, 1, `gift:${d.companionId}`);
    if (giftCounts(ctx, m))
      addBond(ctx, m, giftValue(partyConfig(ctx.content), def, item), `gift:${d.itemId}`);
    return ok();
  },

  'party.tactic'(ctx, d) {
    const kind = d.tactic;
    if (kind !== 'none' && !TACTICS.includes(kind)) return no('bad_tactic');
    const list = d.companionId ? [member(ctx, d.companionId)] : orderable(ctx);
    const field = list.filter((m): m is Member => !!m && !m.temp && stateOf(m) === 'party');
    if (field.length === 0) return no('no_companion');
    const p = playerEntity(ctx.world);
    if (kind === 'interrupt' || kind === 'protect') {
      if (!d.targetId || !liveUnit(ctx.world, d.targetId)) return no('no_target');
    }
    if (kind === 'goto' && (d.x === undefined || d.y === undefined)) return no('no_target');
    for (const m of field) {
      if (kind === 'none') {
        delete m.tactic;
        continue;
      }
      m.tactic = { kind: kind as TacticKind, tick: ctx.tick };
      if (d.targetId) m.tactic.targetId = d.targetId;
      if (kind === 'goto') {
        m.tactic.x = d.x;
        m.tactic.y = d.y;
        if (p) m.tactic.mapId = p.mapId;
      }
      if (kind === 'spread') m.tactic.on = d.on ?? true;
      ctx.emit('party.tactic', { companionId: m.id, tactic: kind as TacticKind });
    }
    return ok();
  },

  'party.formation'(ctx, d) {
    if (!['wedge', 'ring', 'spread'].includes(d.formation)) return no('bad_order');
    if (partyFighting(ctx)) return no('in_combat');
    ctx.world.slices.party.formation = d.formation;
    return ok();
  },

  'party.invite'(ctx, d) {
    const def = companionDef(ctx.content, d.companionId);
    if (!def) return no('no_companion');
    const have = member(ctx, d.companionId);
    if (have && !have.temp) return no('already');
    if ((def.recruit?.mode ?? 'story') === 'story') return no('not_now');
    if (!recruitable(ctx, d.companionId)) return no('unwilling');
    // the flag brings the companion in (index.ts, flag.changed), as a story recruit does
    ctx.setFlag(`companion.${d.companionId}.recruited`, true);
    return ok();
  },

  'party.dismiss'(ctx, d) {
    const m = member(ctx, d.companionId);
    if (!m || m.temp) return no('no_companion');
    const s = stateOf(m);
    if (s !== 'party' && s !== 'waiting') return no('not_in_party');
    standBy(ctx, m);
    return ok();
  },

  'party.swap'(ctx, d) {
    const inM = member(ctx, d.inId);
    if (!inM || inM.temp) return no('no_companion');
    if (stateOf(inM) === 'cold') return no('cold');
    if (stateOf(inM) !== 'standby') return no('not_standby');
    let out: Member | undefined;
    if (!hasFreeSlot(ctx) && inM.pet?.kind !== 'half') {
      out = member(ctx, d.outId);
      if (!out || out.temp || stateOf(out) !== 'party') return no('party_full');
      standBy(ctx, out);
    }
    if (enterParty(ctx, inM)) return ok();
    // the one coming in could not: the one sent out takes its place back
    if (out) enterParty(ctx, out);
    return no('party_full');
  },

  'party.wait'(ctx, d) {
    const list = d.companionId ? [member(ctx, d.companionId)] : orderable(ctx);
    const want = d.on ? 'party' : 'waiting';
    const hit = list.filter((m): m is Member => !!m && !m.temp && stateOf(m) === want);
    if (hit.length === 0) return no('no_companion');
    for (const m of hit) {
      if (d.on) {
        const e = getEntity(ctx.world, m.entityId);
        if (!e) continue;
        m.waitAt = { mapId: e.mapId, x: e.x, y: e.y };
        setState(ctx, m, 'waiting');
      } else {
        delete m.waitAt;
        setState(ctx, m, 'party');
      }
    }
    return ok();
  },

  'party.ironman_off'(ctx) {
    return ironmanOff(ctx) ? ok() : no('not_ironman');
  },

  'party.segment'(ctx, d, source) {
    if (!STORY_SOURCES.has(source.type)) return no('not_allowed');
    return completeSegment(ctx, d.companionId, d.stage, d.bond ?? 0) ? ok() : no('bad_stage');
  },

  'party.wound'(ctx, d, source) {
    if (!STORY_SOURCES.has(source.type)) return no('not_allowed');
    const m = member(ctx, d.companionId);
    if (!m || m.temp) return no('no_companion');
    const s = stateOf(m);
    if (s !== 'party' && s !== 'waiting') return no('not_in_party');
    fall(ctx, m, 'story');
    return ok();
  },

  'party.reconcile'(ctx, d, source) {
    if (!STORY_SOURCES.has(source.type)) return no('not_allowed');
    const m = member(ctx, d.companionId);
    if (!m?.cold) return no('no_companion');
    delete m.cold;
    if (stateOf(m) === 'cold') {
      setState(ctx, m, 'standby');
      if (hasFreeSlot(ctx)) enterParty(ctx, m);
    }
    return ok();
  },

  'party.tame'(ctx, d) {
    const r = tame(ctx, d.targetId);
    return r.ok ? ok() : no(r.code);
  },

  'party.pact'(ctx, d) {
    const r = pact(ctx, d.targetId);
    return r.ok ? ok() : no(r.code);
  },

  'party.release'(ctx, d) {
    return release(ctx, d.companionId) ? ok() : no('no_companion');
  },

  'party.ride'(ctx, d) {
    const code = ride(ctx, d.mountId);
    return code === null ? ok() : no(code);
  },
};

// Records system (phase 85, PK-M1-48): deeds and titles, the codex and letters, the data
// and rule side of ux_and_onboarding.md 6.3.1, 6.3.2 and 6.3.8. It learns from facts other
// systems emit and from world flags, settles at the next tick when something it reads
// changed (catalog_deeds_titles.md 1.3: settle at the end, only when dirty, no random
// draws), and writes only its own slice and mirrors: `deed.<id>`, `title.<id>`,
// `title.<id>.lost`, `player.title`, `letter.<id>` and `letter.<id>.reply`. A model can
// neither grant a deed nor name a title (catalog 2.12): grants come from the content's
// conditions or, for manual deeds, from a system or a script at the scene's settle point;
// the player's own acts on the book (wear, carve, letters) refuse a model's proposal too.

import { ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { unitOf } from '../combat';
import { addItem } from '../inventory';
import { evaluate, flagResolver } from '../quests/conditions';
import { registerSkipHandler } from '../travel/skip_registry';
import { getEntity } from '../world';
import {
  deedDef,
  deedTriggerHolds,
  gradeRank,
  grantDeed,
  pillarSlots,
  settleBook,
  syncMirrors,
  titleDef,
  unwear,
} from './book';
import {
  discover,
  flagSubject,
  isNamedPerson,
  isPlayerSide,
  playerMap,
  settleNotes,
} from './codex';
import { deliverMail, letterDef, markRead, settleLetters } from './letters';
import { emptyRecordsSlice, RECORDS_ID_FIELDS, recordsSlice, validateRecordsSlice } from './slice';
import {
  CODEX_TABS,
  type CodexEntryDef,
  type DeedDef,
  GRADES,
  type LetterDef,
  type RecordsConfig,
  type TitleDef,
} from './types';
import { contentSignature, watchOf } from './watch';
import { firstDungeonClear, firstVictory, tickDiscoveries, xpLedger } from './xp';

export * from './book';
export * from './codex';
export * from './letters';
export * from './slice';
export * from './types';
export * from './view';
export * from './watch';
export * from './xp';
export * from './xp_types';

declare module '../../core/contracts' {
  interface WorldSlices {
    records: import('./types').RecordsSlice;
  }
  interface ContentMap {
    deeds: DeedDef[];
    titles: TitleDef[];
    codexEntries: CodexEntryDef[];
    letters: LetterDef[];
    recordsConfig: RecordsConfig;
  }
  interface EventMap {
    /** a deed entered the book (the doors read it as a history key; achievements map it) */
    'deed.granted': { deedId: string; grade: import('./types').Grade; fame: number };
    'deed.attested': { deedId: string; grade: import('./types').Grade };
    'title.granted': { titleId: string; deedId: string | null };
    'title.lost': { titleId: string };
    'title.worn': { titleId: string | null };
    'pillar.carved': { deedId: string | null; slot: number };
    'codex.discovered': { tab: import('./types').CodexTab; subject: string };
    'codex.noted': { entryId: string; tab: import('./types').CodexTab; subject: string };
    'letter.sent': { letterId: string; arrives: number };
    'letter.delivered': { letterId: string };
    'letter.read': { letterId: string };
    'letter.replied': { letterId: string; optionId: string };
    'letter.taken': { letterId: string };
  }
  interface CommandMap {
    /** grant a manual deed at a scene's settle point (systems and scripts only) */
    'records.deed.grant': { deedId: string; grade?: import('./types').Grade };
    /** raise the grade a deed was recorded with (never lowers; systems and scripts only) */
    'records.deed.attest': { deedId: string; grade: import('./types').Grade };
    /** wear an office title, or nothing (null) */
    'records.title.wear': { titleId: string | null };
    /** carve an earned deed on the pillar (first free slot when no slot), or clear a slot */
    'records.pillar.carve': { deedId: string | null; slot?: number };
    'records.letter.read': { letterId: string };
    'records.letter.reply': { letterId: string; optionId: string };
    /** take a letter's attachments into the player's pack */
    'records.letter.take': { letterId: string };
    /** note a codex subject no fact reports yet (creatures, scripted sightings) */
    'records.codex.discover': { tab: import('./types').CodexTab; subject: string };
  }
}

export const SYSTEM_ID = 'records';

/** Settle passes per tick: grants feed titles, titles feed deeds; the chain is short. */
const MAX_PASSES = 8;

/** Only the kernel's own channels record facts; the player and the model never do. */
const RECORDING_SOURCES = new Set<CommandSource['type']>(['system', 'script']);
/** The player's own acts on the book (wear, carve, letters): never a model's proposal. */
const PLAYER_SOURCES = new Set<CommandSource['type']>(['player', 'system', 'script']);

/** Worlds checked against the slice and the content since they were loaded (memory only). */
const synced = new WeakSet<object>();

/**
 * First settle of a world in this process (a fresh game, or a loaded save): the mirrors are
 * brought in line with the slice (a content rename moves ids in the slice only), and a
 * change of the records content since the slice last settled re-checks everything, so a
 * save from before a content update earns what its world already holds. The same content
 * finds nothing to do, so a loaded run stays identical to the run that never stopped.
 */
function firstSettle(ctx: SystemContext, s: ReturnType<typeof recordsSlice>): void {
  synced.add(ctx.world);
  syncMirrors(ctx, s);
  const sig = contentSignature(ctx.content);
  if (s.content !== sig) {
    s.content = sig;
    s.dirty = true;
  }
}

function settle(ctx: SystemContext): void {
  const s = recordsSlice(ctx.world);
  if (!synced.has(ctx.world)) firstSettle(ctx, s);
  deliverMail(ctx, s);
  if (!s.dirty) return;
  s.dirty = false;
  const resolve = flagResolver(ctx.world.meta.flags);
  let changed = true;
  for (let pass = 0; pass < MAX_PASSES && changed; pass++) {
    changed = settleBook(ctx, s, resolve);
    if (settleNotes(ctx, s, resolve)) changed = true;
    if (settleLetters(ctx, s, resolve)) changed = true;
  }
  // a chain longer than the passes goes on next tick
  if (changed) s.dirty = true;
  // a letter sent this tick with no road is delivered; one on the road waits for mailDue
  deliverMail(ctx, s);
}

registerSkipHandler(SYSTEM_ID, settle);

const notAllowed = () => reject('not_allowed', tr('sys.records.reject.not_allowed'));

export const system: GameSystem & {
  validateSlice: typeof validateRecordsSlice;
  idFields: typeof RECORDS_ID_FIELDS;
} = {
  id: SYSTEM_ID,
  order: 85,
  validateSlice: validateRecordsSlice,
  idFields: RECORDS_ID_FIELDS,
  init(ctx) {
    ctx.world.slices.records = emptyRecordsSlice();
    if (ctx.content.xpRewards) xpLedger(ctx);
  },
  resume(ctx) {
    if (ctx.content.xpRewards) xpLedger(ctx);
  },
  tick(ctx) {
    settle(ctx);
    if (ctx.content.xpRewards) xpLedger(ctx);
    if (ctx.tick % 10 === 0 || ctx.world.slices.records.xp?.vista) tickDiscoveries(ctx);
  },
  commands: {
    'records.deed.grant'(ctx, data, source) {
      if (!RECORDING_SOURCES.has(source.type)) return notAllowed();
      const def = deedDef(ctx.content, data.deedId);
      if (!def) return reject('no_deed', tr('sys.records.reject.no_deed'));
      const s = recordsSlice(ctx.world);
      if (s.deeds[def.id]) return reject('already', tr('sys.records.reject.already'));
      if (!def.manual) return reject('not_manual', tr('sys.records.reject.not_manual'));
      if (data.grade !== undefined && !GRADES.includes(data.grade))
        return reject('bad_grade', tr('sys.records.reject.bad_grade'));
      if (!deedTriggerHolds(def, s, flagResolver(ctx.world.meta.flags)))
        return reject('not_met', tr('sys.records.reject.not_met'));
      grantDeed(ctx, s, def, data.grade ?? def.grade ?? 'claimed');
      s.dirty = true;
      return ok(tr('sys.records.note.deed', { deed: contentText('deeds', def, def.id) }));
    },
    'records.deed.attest'(ctx, data, source) {
      if (!RECORDING_SOURCES.has(source.type)) return notAllowed();
      const def = deedDef(ctx.content, data.deedId);
      const r = def ? recordsSlice(ctx.world).deeds[def.id] : undefined;
      if (!def || !r) return reject('not_earned', tr('sys.records.reject.not_earned'));
      if (!GRADES.includes(data.grade))
        return reject('bad_grade', tr('sys.records.reject.bad_grade'));
      if (gradeRank(data.grade) < gradeRank(r.grade))
        return reject('lower_grade', tr('sys.records.reject.lower_grade'));
      if (data.grade !== r.grade) {
        r.grade = data.grade;
        ctx.emit('deed.attested', { deedId: def.id, grade: data.grade });
      }
      return ok(tr('sys.records.note.attested', { deed: contentText('deeds', def, def.id) }));
    },
    'records.title.wear'(ctx, data, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const s = recordsSlice(ctx.world);
      if (data.titleId === null) {
        unwear(ctx, s);
        return ok(tr('sys.records.note.unworn'));
      }
      const def = titleDef(ctx.content, data.titleId);
      if (!def) return reject('no_title', tr('sys.records.reject.no_title'));
      const r = s.titles[def.id];
      if (!r) return reject('not_held', tr('sys.records.reject.not_held'));
      if (r.lost !== undefined)
        return reject(
          'title_lost',
          tr('sys.records.reject.title_lost', { loss: contentText('titles', def, '', 'loss') }),
        );
      if (def.kind !== 'office')
        return reject('not_wearable', tr('sys.records.reject.not_wearable'));
      if (s.worn !== def.id) {
        s.worn = def.id;
        ctx.setFlag('player.title', def.id);
        ctx.emit('title.worn', { titleId: def.id });
      }
      return ok(tr('sys.records.note.worn', { title: contentText('titles', def, def.id) }));
    },
    'records.pillar.carve'(ctx, data, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const s = recordsSlice(ctx.world);
      const slots = pillarSlots(ctx.content.recordsConfig, flagResolver(ctx.world.meta.flags));
      if (slots <= 0) return reject('pillar_locked', tr('sys.records.reject.pillar_locked'));
      const slot = data.slot;
      if (slot !== undefined && (!Number.isInteger(slot) || slot < 0 || slot >= slots))
        return reject('bad_slot', tr('sys.records.reject.bad_slot'));
      if (data.deedId === null) {
        if (slot === undefined) return reject('bad_slot', tr('sys.records.reject.bad_slot'));
        if ((s.pillar[slot] ?? null) !== null) {
          s.pillar[slot] = null;
          ctx.emit('pillar.carved', { deedId: null, slot });
        }
        return ok(tr('sys.records.note.cleared'));
      }
      const def = deedDef(ctx.content, data.deedId);
      if (!def || !s.deeds[def.id])
        return reject('not_earned', tr('sys.records.reject.not_earned'));
      if (!def.reward?.pillar) return reject('not_carvable', tr('sys.records.reject.not_carvable'));
      let at = slot;
      if (at === undefined) {
        for (let i = 0; i < slots; i++) {
          if ((s.pillar[i] ?? null) === null || s.pillar[i] === def.id) {
            at = i;
            break;
          }
        }
        if (at === undefined) return reject('pillar_full', tr('sys.records.reject.pillar_full'));
      }
      while (s.pillar.length <= at) s.pillar.push(null);
      // a deed is carved once: carving it elsewhere moves it
      for (let i = 0; i < s.pillar.length; i++)
        if (i !== at && s.pillar[i] === def.id) s.pillar[i] = null;
      if (s.pillar[at] !== def.id) {
        s.pillar[at] = def.id;
        ctx.emit('pillar.carved', { deedId: def.id, slot: at });
      }
      return ok(tr('sys.records.note.carved', { deed: contentText('deeds', def, def.id) }));
    },
    'records.letter.read'(ctx, data, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const def = letterDef(ctx, data.letterId);
      const r = def ? recordsSlice(ctx.world).letters[def.id] : undefined;
      if (!def || !r || r.state === 'transit')
        return reject('no_letter', tr('sys.records.reject.no_letter'));
      markRead(ctx, def.id, r);
      return ok(
        tr('sys.records.note.read', { subject: contentText('letters', def, def.id, 'subject') }),
      );
    },
    'records.letter.reply'(ctx, data, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const def = letterDef(ctx, data.letterId);
      const r = def ? recordsSlice(ctx.world).letters[def.id] : undefined;
      if (!def || !r || r.state === 'transit')
        return reject('no_letter', tr('sys.records.reject.no_letter'));
      if (r.state === 'replied')
        return reject('already_replied', tr('sys.records.reject.already_replied'));
      const opt = (def.replies ?? []).find((x) => x.id === data.optionId);
      const resolve = flagResolver(ctx.world.meta.flags);
      if (!opt || (opt.when && !evaluate(opt.when, resolve)))
        return reject('no_option', tr('sys.records.reject.no_option'));
      markRead(ctx, def.id, r);
      r.state = 'replied';
      r.reply = opt.id;
      ctx.setFlag(`letter.${def.id}.reply`, opt.id);
      ctx.setFlag(`letter.${def.id}`, 'replied');
      ctx.emit('letter.replied', { letterId: def.id, optionId: opt.id });
      return ok(
        tr('sys.records.note.replied', { subject: contentText('letters', def, def.id, 'subject') }),
      );
    },
    'records.letter.take'(ctx, data, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const def = letterDef(ctx, data.letterId);
      const r = def ? recordsSlice(ctx.world).letters[def.id] : undefined;
      if (!def || !r || r.state === 'transit')
        return reject('no_letter', tr('sys.records.reject.no_letter'));
      const items = def.attachments ?? [];
      if (items.length === 0)
        return reject('no_attachment', tr('sys.records.reject.no_attachment'));
      if (r.taken) return reject('already_taken', tr('sys.records.reject.already_taken'));
      const player = ctx.world.slices.world?.playerId;
      if (!player) return reject('no_letter', tr('sys.records.reject.no_letter'));
      for (const a of items) addItem(ctx, player, a.item, a.count ?? 1, 'letter');
      r.taken = true;
      markRead(ctx, def.id, r);
      ctx.emit('letter.taken', { letterId: def.id });
      return ok(
        tr('sys.records.note.taken', { subject: contentText('letters', def, def.id, 'subject') }),
      );
    },
    'records.codex.discover'(ctx, data, source) {
      if (!RECORDING_SOURCES.has(source.type)) return notAllowed();
      if (!CODEX_TABS.includes(data.tab) || !data.subject)
        return reject('bad_tab', tr('sys.records.reject.bad_tab'));
      discover(ctx, recordsSlice(ctx.world), data.tab, data.subject);
      return ok();
    },
  },
  on: {
    'flag.changed'(ctx, e) {
      const key = e.data.key;
      const s = recordsSlice(ctx.world);
      const hit = e.data.value === true ? flagSubject(key) : null;
      if (hit) discover(ctx, s, hit.tab, hit.subject);
      if (watchOf(ctx.content).names.has(key)) s.dirty = true;
    },
    'player.talked'(ctx, e) {
      // only named persons: an unnamed resident has no codex page (ux 6.3.2)
      const subject = e.data.npcRef;
      if (!subject || !isNamedPerson(ctx.content, subject)) return;
      const map = playerMap(ctx);
      discover(ctx, recordsSlice(ctx.world), 'people', subject, map ? { map } : {});
    },
    'combat.damage'(ctx, e) {
      // a monster the player's side fought is encountered (its kills still count 0)
      const { sourceId, targetId } = e.data;
      const foe = isPlayerSide(ctx, sourceId)
        ? targetId
        : isPlayerSide(ctx, targetId)
          ? sourceId
          : undefined;
      const m = foe ? getEntity(ctx.world, foe) : undefined;
      if (m?.kind !== 'monster' || !m.ref) return;
      const s = recordsSlice(ctx.world);
      if (!s.codex.monsters[m.ref]) discover(ctx, s, 'monsters', m.ref, { count: 0 });
    },
    'combat.kill'(ctx, e) {
      if (e.data.monsterId) firstVictory(ctx, e.data.victimId, e.data.monsterId, e.data.killerId);
      if (!e.data.monsterId || !isPlayerSide(ctx, e.data.killerId)) return;
      discover(ctx, recordsSlice(ctx.world), 'monsters', e.data.monsterId);
    },
    'combat.boss_defeated'(ctx, e) {
      if (!e.data.yielded) return;
      const victim = unitOf(ctx.world, e.data.entityId);
      firstVictory(
        ctx,
        e.data.entityId,
        e.data.bossId,
        e.data.killerId ?? victim?.tapped ?? undefined,
      );
    },
    'dungeon.cleared'(ctx, e) {
      firstDungeonClear(ctx, e.data);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id === ctx.world.slices.world.playerId) tickDiscoveries(ctx);
    },
    'inventory.changed'(ctx, e) {
      if (e.data.delta <= 0 || e.data.ownerId !== ctx.world.slices.world?.playerId) return;
      discover(ctx, recordsSlice(ctx.world), 'items', e.data.itemId, { count: e.data.delta });
    },
  },
};

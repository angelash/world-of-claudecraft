// Guild system (phase 82, PK-M1-47): the adventurers' guild registration and ranks from F,
// the guild's cut, the commission boards with their templates `cmm_` instanced as quests of
// kind `commission`, and the dynamic event kernel `ev_` (catalog_quests_acts1_3.md 2, 3;
// society.md 3; ux_and_onboarding.md 6.3.7 data side). Hourly it rolls the week over, tops
// up the boards and steps the events; when a flag moves it settles registration and
// promotion; when a commission's quest closes it pays, records or counts the default. All
// draws are on named streams (`guild.board.<board>`, `guild.events`), so instancing is
// reproducible from the seed. Rules only: a model never takes, posts or settles a commission.

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { failQuest } from '../quests/outcomes';
import { finishQuest } from '../quests/progress';
import { registerSkipHandler } from '../travel/skip_registry';
import {
  atBoard,
  boardDef,
  boardsStale,
  guildConfig,
  playerRank,
  postingQuest,
  postingTitle,
  refusalText,
  register,
  setRank,
  settleBoards,
  settleDefault,
  settleDone,
  settleFirstIn,
  settleMember,
  settleWeek,
  take,
  takeRefusal,
} from './board';
import { directorLanded, settleEvents } from './events';
import { defaultPenalty } from './formulas';
import { nextRankDef, promotionNeeds, rankDef, rankIndex, readyForExam } from './ranks';
import { emptyGuildSlice, GUILD_ID_FIELDS, guildSlice, validateGuildSlice } from './slice';
import type { BoardDef, CommissionDef, DynamicEventDef, GuildConfig, GuildRank } from './types';
import { GUILD_RANKS } from './types';

export * from './board';
export * from './events';
export * from './formulas';
export * from './instance';
export * from './ranks';
export * from './slice';
export * from './types';
export * from './view';

declare module '../../core/contracts' {
  interface WorldSlices {
    guild: import('./types').GuildSlice;
  }
  interface ContentMap {
    guildConfig: GuildConfig;
    guildBoards: BoardDef[];
    commissions: CommissionDef[];
    dynamicEvents: DynamicEventDef[];
  }
  interface CommandMap {
    /** register with the guild at the counter (the fee is due) */
    'guild.register': Record<string, never>;
    /** take a posting from a board */
    'guild.accept': { postingId: string };
    /** hand a finished commission in at its board */
    'guild.turn_in': { postingId: string };
    /** walk away from a taken commission (the default penalty is due) */
    'guild.abandon': { postingId: string };
    /** an examination's result: the rank, by the regular path or by practical recognition */
    'guild.promote': { rank: GuildRank; practical?: boolean };
  }
}

export const SYSTEM_ID = 'guild';

/** The player's own acts at the board; never a model's proposal. */
const PLAYER_SOURCES = new Set<CommandSource['type']>(['player', 'system', 'script']);
/** Examination results come from the story and the kernel only. */
const EXAM_SOURCES = new Set<CommandSource['type']>(['system', 'script']);

const notAllowed = () => reject('not_allowed', tr('sys.guild.reject.not_allowed'));

function settle(ctx: SystemContext): void {
  const s = guildSlice(ctx.world);
  if (!s.dirty) return;
  s.dirty = false;
  settleMember(ctx);
  // a board opens (or closes) with the act at once, not at the next hour
  if (guildConfig(ctx) && boardsStale(ctx)) {
    settleWeek(ctx);
    settleBoards(ctx);
  }
}

function hourly(ctx: SystemContext): void {
  if (!guildConfig(ctx)) return;
  // a registration condition may read the calendar, which moves without a flag
  settleMember(ctx);
  settleWeek(ctx);
  settleBoards(ctx);
  settleEvents(ctx);
}

registerSkipHandler(SYSTEM_ID, settle);

/** The board a player-sourced command acts at: they must stand on its map. */
function boardOk(ctx: SystemContext, postingId: string, source: CommandSource): boolean {
  if (source.type !== 'player') return true;
  const p = guildSlice(ctx.world).postings[postingId];
  return atBoard(ctx, p ? boardDef(ctx, p.board) : undefined);
}

export const system: GameSystem & {
  validateSlice: typeof validateGuildSlice;
  idFields: typeof GUILD_ID_FIELDS;
} = {
  id: SYSTEM_ID,
  order: 82,
  validateSlice: validateGuildSlice,
  idFields: GUILD_ID_FIELDS,

  init(ctx) {
    ctx.world.slices.guild = emptyGuildSlice();
  },

  tick: settle,

  commands: {
    'guild.register'(ctx, _d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const cfg = guildConfig(ctx);
      if (!cfg) return reject('no_guild', tr('sys.guild.reject.no_posting'));
      if (playerRank(ctx) || guildSlice(ctx.world).member)
        return reject('already', tr('sys.guild.reject.already_registered'));
      // the player registers at a clerk's counter (a board with a receptionist)
      const counter = (ctx.content.guildBoards ?? []).some(
        (b) => b.receptionist && atBoard(ctx, b),
      );
      if (source.type === 'player' && !counter) return reject('far', tr('sys.guild.reject.far'));
      if (!register(ctx, true))
        return reject('no_money', tr('sys.guild.reject.fee', { fee: cfg.registration.fee }));
      return ok(
        tr('sys.guild.note.registered', { rank: tr(`sys.guild.rank.${playerRank(ctx) ?? 'f'}`) }),
      );
    },
    'guild.accept'(ctx, d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const refusal = takeRefusal(ctx, d.postingId, boardOk(ctx, d.postingId, source));
      if (refusal) return reject(refusal.code, refusalText(refusal));
      const p = take(ctx, d.postingId);
      if (!p) return reject('no_posting', tr('sys.guild.reject.no_posting'));
      return ok(tr('sys.guild.note.accepted', { title: postingTitle(ctx, p) }));
    },
    'guild.turn_in'(ctx, d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const p = guildSlice(ctx.world).postings[d.postingId];
      if (p?.state !== 'accepted') return reject('not_held', tr('sys.guild.reject.not_held'));
      if (!boardOk(ctx, d.postingId, source)) return reject('far', tr('sys.guild.reject.far'));
      const run = postingQuest(ctx, p);
      if (run?.q.status !== 'ready') return reject('not_ready', tr('sys.guild.reject.not_ready'));
      finishQuest(ctx, run.def, run.q);
      return ok(tr('sys.guild.note.turned_in', { title: postingTitle(ctx, p), pay: p.reward }));
    },
    'guild.abandon'(ctx, d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const cfg = guildConfig(ctx);
      const p = guildSlice(ctx.world).postings[d.postingId];
      if (!cfg || !p || p.state !== 'accepted')
        return reject('not_held', tr('sys.guild.reject.not_held'));
      const run = postingQuest(ctx, p);
      if (!run) return reject('not_held', tr('sys.guild.reject.not_held'));
      failQuest(ctx, run.def, run.q);
      return ok(
        tr('sys.guild.note.abandoned', {
          title: postingTitle(ctx, p),
          penalty: defaultPenalty(cfg, p.reward),
        }),
      );
    },
    'guild.promote'(ctx, d, source) {
      if (!EXAM_SOURCES.has(source.type)) return notAllowed();
      const cfg = guildConfig(ctx);
      const s = guildSlice(ctx.world);
      const own = playerRank(ctx);
      if (!cfg || !own || !s.member)
        return reject('not_registered', tr('sys.guild.reject.not_registered'));
      if (!GUILD_RANKS.includes(d.rank) || !rankDef(cfg, d.rank))
        return reject('bad_rank', tr('sys.guild.reject.bad_rank'));
      if (rankIndex(d.rank) <= rankIndex(own))
        return reject('not_higher', tr('sys.guild.reject.not_higher'));
      if (!d.practical) {
        // the regular path: the next rank, with every requirement but the exam itself met
        const next = nextRankDef(cfg, own);
        if (!next || next.id !== d.rank) return reject('one_step', tr('sys.guild.reject.one_step'));
        if (!readyForExam(promotionNeeds(next, s.member, cfg.registration.cardLevel)))
          return reject('not_ready_rank', tr('sys.guild.reject.requirements'));
      }
      setRank(ctx, d.rank, d.practical ? 'practical' : 'exam');
      return ok(tr('sys.guild.note.promoted', { rank: tr(`sys.guild.rank.${d.rank}`) }));
    },
  },

  on: {
    'flag.changed'(ctx) {
      // batched: registration, promotion and the rank flag settle on the next tick
      const s = ctx.world.slices.guild;
      if (s) s.dirty = true;
    },
    'world.hour'(ctx) {
      hourly(ctx);
    },
    'quest.completed'(ctx, e) {
      settleFirstIn(ctx, e.data.questId);
      if (e.data.kind === 'commission') settleDone(ctx, e.data.questId);
    },
    'quest.failed'(ctx, e) {
      settleDefault(ctx, e.data.questId, 'failed');
    },
    'quest.expired'(ctx, e) {
      settleDefault(ctx, e.data.questId, 'expired');
    },
    'director.move'(ctx, e) {
      directorLanded(ctx, e.data.itemId);
    },
  },
};

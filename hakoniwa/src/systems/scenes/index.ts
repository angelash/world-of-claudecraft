// Scenes system (phase 85): written scenes with choices, free text, model improvisation
// with written fallbacks, the act 6 court, the endings and the epilogue. Any system may
// request a scene by setting the flag `scene.pending`; the prologue starts by itself.
// See docs/30_story/arcs/prologue_antechamber.md and act6_review_and_epilogue.md.
// The runner additions of catalog_cutscenes.md 13.6: interfaces opened by `ui` effects,
// multi-turn inputs with soft and hard caps, timed choices, segment markers, combat barks
// on wave and boss events (barks.ts) and re-choosing the opening.

import type { GameSystem } from '../../core/system';
import { openingAct } from '../quests/act_order';
import { barkOn } from './barks';
import { emptyCourt } from './court';
import {
  choiceTimeouts,
  cmdAdvance,
  cmdChoose,
  cmdInput,
  cmdResolve,
  cmdRestart,
  cmdStart,
  cmdUiDone,
  type ResolveData,
  requestScene,
  resolveTimeouts,
  type UiDoneData,
} from './runner';
import type { CourtDefenseDef, EpilogueEntry, EvidenceDef, SceneDef, SpeakerDef } from './types';

export * from './barks';
export * from './court';
export * from './epilogue';
export * from './runner';
export * from './types';
export * from './ui_results';
export * from './view';

declare module '../../core/contracts' {
  interface WorldSlices {
    scenes: import('./types').ScenesSlice;
  }
  interface ContentMap {
    scenes: SceneDef[];
    sceneSpeakers: SpeakerDef[];
    evidence: EvidenceDef[];
    courtDefenses: CourtDefenseDef[];
    epilogue: EpilogueEntry[];
  }
  interface EventMap {
    'scene.started': { sceneId: string; title: string };
    'scene.ended': { sceneId: string };
    'scene.choice': { sceneId: string; nodeId: string; choiceId: string; label: string };
    /** a `ui` effect opened an interface; the run waits for scenes.ui_done */
    'scene.ui': { sceneId: string; nodeId: string; ui: string };
    'scene.ui_closed': { sceneId: string; nodeId: string; ui: string };
    /** a segment marker node was entered (multi-entry scenes) */
    'scene.segment': { sceneId: string; segment: string };
    /** the opening was chosen again: the flags cleared, the scene that plays */
    'scene.restarted': { sceneId: string; to: string; cleared: string[] };
  }
  interface CommandMap {
    'scenes.start': { sceneId: string };
    'scenes.choose': { choiceId: string };
    'scenes.input': { text: string };
    'scenes.advance': Record<string, never>;
    /** model or fallback lines for the current node (revision-checked) */
    'scenes.resolve': ResolveData;
    /** the client closed the interface of a `ui` effect (revision-checked) */
    'scenes.ui_done': UiDoneData;
    /** re-choose the opening while the playing scene offers it */
    'scenes.restart': Record<string, never>;
  }
}

export const system: GameSystem = {
  id: 'scenes',
  order: 85,

  init(ctx) {
    ctx.world.slices.scenes = {
      current: null,
      queue: [],
      nextRunId: 1,
      seen: [],
      court: emptyCourt(),
      epilogue: [],
      barked: [],
    };
  },

  tick(ctx) {
    resolveTimeouts(ctx);
    choiceTimeouts(ctx);
    // The opening act's intro scene (the prologue) starts on the first tick (listeners
    // attach after creation).
    if (ctx.tick === 1) {
      const opening = openingAct(ctx.content);
      const scene = opening?.introScene;
      if (
        scene &&
        ctx.flag('act') === opening.id &&
        !ctx.world.slices.scenes.seen.includes(scene)
      ) {
        requestScene(ctx, scene);
      }
    }
  },

  commands: {
    'scenes.start'(ctx, d) {
      return cmdStart(ctx, d.sceneId);
    },
    'scenes.choose'(ctx, d) {
      return cmdChoose(ctx, d.choiceId);
    },
    'scenes.input'(ctx, d) {
      return cmdInput(ctx, d.text);
    },
    'scenes.advance'(ctx) {
      return cmdAdvance(ctx);
    },
    'scenes.resolve'(ctx, d, source) {
      return cmdResolve(ctx, d, source.type === 'ai');
    },
    'scenes.ui_done'(ctx, d) {
      return cmdUiDone(ctx, d);
    },
    'scenes.restart'(ctx) {
      return cmdRestart(ctx);
    },
  },

  on: {
    'flag.changed'(ctx, e) {
      if (e.data.key !== 'scene.pending') return;
      const id = String(e.data.value ?? '');
      if (!id) return;
      requestScene(ctx, id);
      ctx.setFlag('scene.pending', '');
    },
    // combat barks (barks.ts): the combat system's wave and boss events, read only
    'combat.wave_spawned'(ctx, e) {
      barkOn(ctx, 'wave_spawned', e.data.waveId);
    },
    'combat.wave_cleared'(ctx, e) {
      barkOn(ctx, 'wave_cleared', e.data.waveId);
    },
    'combat.boss_phase'(ctx, e) {
      barkOn(ctx, 'boss_phase', e.data.bossId, e.data.phase);
    },
    'combat.boss_defeated'(ctx, e) {
      barkOn(ctx, 'boss_defeated', e.data.bossId);
    },
  },
};

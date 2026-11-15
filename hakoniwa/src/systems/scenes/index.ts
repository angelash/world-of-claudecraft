// Scenes system (phase 85): written scenes with choices, free text, model improvisation
// with written fallbacks, the act 6 court, the endings and the epilogue. Any system may
// request a scene by setting the flag `scene.pending`; the prologue starts by itself.
// See docs/30_story/arcs/prologue_antechamber.md and act6_review_and_epilogue.md.

import type { GameSystem } from '../../core/system';
import { openingAct } from '../quests/act_order';
import { emptyCourt } from './court';
import {
  cmdAdvance,
  cmdChoose,
  cmdInput,
  cmdResolve,
  cmdStart,
  type ResolveData,
  requestScene,
  resolveTimeouts,
} from './runner';
import type { CourtDefenseDef, EpilogueEntry, EvidenceDef, SceneDef, SpeakerDef } from './types';

export * from './court';
export * from './epilogue';
export * from './runner';
export * from './types';
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
  }
  interface CommandMap {
    'scenes.start': { sceneId: string };
    'scenes.choose': { choiceId: string };
    'scenes.input': { text: string };
    'scenes.advance': Record<string, never>;
    /** model or fallback lines for the current node (revision-checked) */
    'scenes.resolve': ResolveData;
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
    };
  },

  tick(ctx) {
    resolveTimeouts(ctx);
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
  },

  on: {
    'flag.changed'(ctx, e) {
      if (e.data.key !== 'scene.pending') return;
      const id = String(e.data.value ?? '');
      if (!id) return;
      requestScene(ctx, id);
      ctx.setFlag('scene.pending', '');
    },
  },
};

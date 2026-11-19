// The prologue steps of ux_and_onboarding.md 17.5 (9 rows). Data only; the types and the
// builders are in ./steps.ts.
//
// `tut_p_listen` follows the prologue document instead of the 17.5 row: the eavesdrop tier is
// one stance choice before the quarrel starts, never the player's position between segments
// (prologue_antechamber.md 3.1, the PK-M1-54 decision, canon first). So it fires when the
// player picked the far tier (`p_eavesdrop_level` written as 0, the bench, or 1, the cough
// that ends far) and says the eavesdropping has three distances, instead of asking a standing
// player to walk closer.

import {
  after,
  anyOf,
  ev,
  field,
  flagChanged,
  flagCond,
  seen,
  sig,
  step,
  type TutStep,
  timer,
} from './steps';

/** The spirit mirror opens as a scene effect `ui` (prologue.json `n3_mirror`, 3.4.3). */
const MIRROR_UI = 'ui_mode_creator';

export const PROLOGUE_STEPS: readonly TutStep[] = [
  step({
    id: 'tut_p_move',
    category: 'ops',
    methods: ['bar'],
    // the committed hint bar fires move and talk itself: ask under its id and key
    barId: 'move',
    barKey: 'ui.hud.hint.move',
    trigger: timer('can_move', 2000, 'moved'),
    done: sig('moved'),
    priority: 'action',
  }),
  step({
    id: 'tut_p_camera',
    category: 'ops',
    methods: ['bar'],
    trigger: timer('moved', 10_000),
    // "转动一次或 20 秒": no event reports a turn of the camera, so the 20 s end it
    done: after(20_000),
    priority: 'action',
  }),
  step({
    id: 'tut_p_interact',
    category: 'ops',
    methods: ['bar', 'glow'],
    barId: 'talk',
    barKey: 'ui.hud.hint.talk',
    trigger: sig('near_interactable'),
    done: anyOf(sig('talking'), ev('dialogue.opened'), ev('player.talked')),
    glowTarget: 'prompt',
    priority: 'action',
  }),
  step({
    id: 'tut_p_mirror',
    category: 'ops',
    methods: ['card'],
    trigger: ev('scene.ui', field('ui', 'eq', MIRROR_UI)),
    done: anyOf(ev('scene.ui_closed', field('ui', 'eq', MIRROR_UI)), flagCond('p_mirror_done')),
    duringScene: true,
    paragraphs: 2,
  }),
  step({
    id: 'tut_p_listen',
    category: 'social',
    methods: ['narr', 'bar'],
    // the stance choice writes the tier: 0 (the bench) or 1 (the cough, which ends far)
    trigger: anyOf(flagChanged('p_eavesdrop_level', 'lte', 1), sig('listen_far')),
    done: anyOf(sig('listen_end'), ev('scene.ended')),
    duringScene: true,
  }),
  step({
    id: 'tut_p_name',
    category: 'ops',
    methods: ['narr', 'glow'],
    trigger: sig('name_prompt'),
    done: anyOf(sig('name_answered'), ev('scene.classified')),
    glowTarget: 'scene_input',
    priority: 'action',
    duringScene: true,
  }),
  step({
    id: 'tut_p_answer',
    category: 'social',
    methods: ['card'],
    trigger: sig('answer_prompt'),
    done: anyOf(sig('answered'), ev('scene.classified'), ev('scene.choice')),
    paragraphs: 2,
    duringScene: true,
  }),
  step({
    id: 'tut_p_restart',
    category: 'ops',
    methods: ['glow'],
    trigger: sig('menu_opened'),
    done: seen(),
    glowTarget: 'menu_restart',
  }),
  step({
    id: 'tut_p_reach',
    category: 'ops',
    // not taught: the scene panel's own key prompt is the only thing on screen (17.5), drawn by
    // the prologue stage (src/client/hud/story/prologue_stage.ts keyPrompts) at every level
    methods: ['narr'],
    silent: true,
    trigger: sig('falling'),
    done: anyOf(sig('fall_ended'), ev('scene.choice', field('choiceId', 'eq', 'reach'))),
    priority: 'danger',
    duringScene: true,
    // the fall is a narrative test: outside the onboarding progress (17.5)
    skippable: false,
    mandatory: 'scene_prompt',
    progress: false,
  }),
];

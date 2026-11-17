// src/client/hud/story/: `ui_mode_dialogue` and `ui_mode_cutscene` (ux_and_onboarding.md 7, 8;
// catalog_cutscenes.md 13). Pure cores: reading (typewriter, auto advance, the skip hold),
// backlog, portrait_plan, stage (directives and the CutsceneAudio seam), letter_card,
// dialogue_model, cutscene_model and story_controller; painters: portrait_view, backlog_view,
// dialogue_panel, cutscene_player and story_view. The session owns one StoryController and one
// StoryView and paints a story frame every animation frame while a story surface shows.

export { Backlog, type BacklogEntry } from './backlog';
export type { CutsceneModel } from './cutscene_model';
export type { DialogueModel } from './dialogue_model';
export { lineSignature } from './dialogue_model';
export type { StoryHandlers } from './handlers';
export { type LetterCard, letterCard } from './letter_card';
export {
  dialogueLayout,
  expressionChain,
  type PortraitPlan,
  resolvePortrait,
  type SpeakerRef,
} from './portrait_plan';
export type { CropSource } from './portrait_view';
export {
  AutoAdvance,
  autoDwellMs,
  charsShown,
  HoldWatch,
  LineReader,
  SKIP_HOLD_MS,
} from './reading';
export {
  type CutsceneAudio,
  cutsceneDirectorInput,
  SILENT_AUDIO,
  type StageState,
} from './stage';
export {
  type StoryActions,
  StoryController,
  type StoryFrame,
  type StoryInput,
} from './story_controller';
export { StoryView } from './story_view';

// The onboarding (ux_and_onboarding.md 17; PK-M1-23), the barrel of src/client/tutorial/.
//
// Local rules for this directory:
// - The catalogue is data (./steps_p.ts, ./steps_a1.ts, ./steps_any.ts, assembled in
//   ./catalog.ts): one record per 17.5 row, with declarative triggers and completions. A new
//   step is a record plus its `tut.<step>.*` text in locales/zh-Hans/tut.json; never a branch
//   in the session.
// - Triggers read only registered flags (data/registry/vars.json), kernel event kinds (typed
//   against `EventKind`, filtered to the player with `PLAYER`) or named signals: the ones the
//   session feeds (`SESSION_SIGNALS`) or ones waiting on a package (`WAITING_SIGNALS`). The onboarding check
//   (`node tools/tutorial/check.ts`, rules in ./check.ts) holds the catalogue to that, to the
//   17.5 counts and to the string tables.
// - Pure cores (no DOM, no wall clock, no real randomness; the caller passes `now`):
//   steps, catalog, store, scheduler, triggers, card_model, glow_model, glossary, check. The
//   painters are card_pop.ts and glow.ts; tutorial_session.ts is the one object the game
//   session owns and wires.
// - Onboarding never changes the world: the store rides the save's client segment, never the
//   world state or the replay log (17.8); first-encounter softening is content data (17.1).

export { DESIGN_COUNTS, stepById, TUT_EVENT_KINDS, TUT_STEPS } from './catalog';
export {
  checkGlossary,
  checkTutorial,
  checkTutText,
  type TutFinding,
  type WaitingStep,
  waitingSteps,
} from './check';
export { GLOSSARY, glossaryModel } from './glossary';
export { TutorialScheduler } from './scheduler';
export type { TutAct, TutCategory, TutSignal, TutStep, TutWindow } from './steps';
export {
  PLAYER,
  SESSION_SIGNALS,
  SIGNAL_SOURCES,
  TUT_SIGNALS,
  WAITING_SIGNALS,
} from './steps';
export { MUTED_KEY, type TutorialSnapshot, TutorialStore } from './store';
export { type TutItemInfo, TutorialTriggers } from './triggers';
export {
  type TutorialBarHost,
  type TutorialDeps,
  type TutorialInput,
  TutorialSession,
} from './tutorial_session';

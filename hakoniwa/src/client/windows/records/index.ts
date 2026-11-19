// The record windows (PK-M1-23): `ui_win_deeds` (ux_and_onboarding.md 6.3.1), `ui_win_codex`
// (6.3.2), `ui_win_letters` (6.3.8) and `ui_win_evidence` (6.3.11). Each is a pure model plus
// a thin painter; this barrel is the subsystem's whole public surface, so the window registry
// imports only from here.

export {
  ACT_ORDER,
  actRank,
  CODEX_TAB_ORDER,
  type CodexMemoryGroup,
  type CodexModel,
  type CodexSubjectRow,
  codexModel,
  countText,
  monsterName,
} from './codex_model';
export { codexWindow } from './codex_window';
export {
  DEED_CLASS_ORDER,
  DEEDS_TABS,
  type DeedGroup,
  type DeedRow,
  type DeedsModel,
  type DeedsTab,
  deedsModel,
  fameBand,
  type PillarSlotRow,
  type TitleRow,
  UNRECORDED_GROUP,
  wearTarget,
} from './deeds_model';
export { deedsWindow } from './deeds_window';
export {
  cleanNote,
  EVIDENCE_TABS,
  type EvidenceModel,
  type EvidenceRow,
  type EvidenceTab,
  evidenceModel,
  LINE_KEYS,
  NOTE_MAX,
} from './evidence_model';
export { evidenceWindow } from './evidence_window';
export {
  LETTERS_TABS,
  type LetterRow,
  type LettersModel,
  type LettersTab,
  lettersModel,
  MESSENGER_FLAG,
  unreadCount,
} from './letters_model';
export { lettersWindow } from './letters_window';
export { mortalName, termPair } from './mortal_name';

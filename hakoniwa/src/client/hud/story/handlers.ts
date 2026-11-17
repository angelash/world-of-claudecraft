// What the story painters call back (`ui_mode_dialogue`, `ui_mode_cutscene`): the session
// implements these over the adapters, the player input and the story controller. Types only.

export interface StoryHandlers {
  /** conversation: pick option `id` */
  choose(optionId: string): void;
  /** conversation: say free text */
  say(text: string): void;
  /** conversation: leave */
  leave(): void;
  /** a click on the dialogue panel or the cutscene card: the advance press */
  advance(): void;
  /** cutscene: pick a choice (irreversible ones are confirmed by the painter first) */
  chooseScene(choiceId: string): void;
  /** cutscene: submit free text */
  submitScene(text: string): void;
  /** cutscene: re-choose the opening (confirmed by the painter first) */
  restartScene(): void;
  skip(): void;
  toggleAuto(): void;
  toggleHidden(): void;
  toggleBacklog(): void;
  /** close the summary card */
  closeCard(): void;
  /** block and flag a generated line (ux 7.3); `sig` is its signature */
  block(sig: string): void;
}

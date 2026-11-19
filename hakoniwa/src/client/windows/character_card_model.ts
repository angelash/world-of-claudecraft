// Only the player-visible snapshot from adapters/player_cards reaches this panel.

export interface CharacterCardModel {
  id: string;
  name: string;
  subtitle: string;
  place: string;
  activity: string;
  attitude: string;
  known: { text: string; source: string; age: number }[];
  potential: string;
  canTalk: boolean;
  canAppraise: boolean;
  self: boolean;
}

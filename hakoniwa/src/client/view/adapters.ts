// View adapters: the seam between the client and the gameplay systems. Every HUD element
// and window reads its data and builds its commands through these interfaces; the
// implementations live in src/client/adapters/ and call each system's exported queries.
// Where a system already exports a view type, the adapter passes it through unchanged.
// Every adapter is optional: a missing one shows the "not yet available" state.

import type { AnyWorldEvent } from '../../core/contracts';
import type { PlacementResult, SettlementView } from '../../systems/city';
import type {
  AppraisalResult,
  PressureSense,
  Reputation,
  RumorBookEntry,
} from '../../systems/cognition';
import type { DoorView } from '../../systems/doors';
import type { CompanyView, TradeSessionView } from '../../systems/economy';
import type { GoddessView, MiracleEntry } from '../../systems/goddess';
import type { CompanionView, PartyOrder } from '../../systems/party';
import type { QuestLogView } from '../../systems/quests';
import type { SceneView } from '../../systems/scenes';
import type {
  ContinentView,
  DiplomacyAction,
  DiplomacyRow,
  NationView,
  TreatyType,
} from '../../systems/strategy';
import type { BattleView, Formation } from '../../systems/warfare';
import type { MarkerKind } from '../render/markers';
import type { ClientCommand, GameView } from './game_view';

export type Commands = ClientCommand[];

// ---------------------------------------------------------------------------
// Unit frames (player, target, party)

export interface BarView {
  value: number;
  max: number;
}

export interface ResourceBarView extends BarView {
  /** mana, rage, energy, ... */
  kind: string;
  /** short display name, Chinese */
  label: string;
  /** css colour; the HUD picks one by kind when absent */
  color?: string;
}

export interface AuraView {
  id: string;
  name: string;
  harmful: boolean;
  /** seconds left, null for permanent */
  remaining: number | null;
  stacks: number;
}

export interface CastView {
  name: string;
  /** 0..1 */
  progress: number;
}

export interface UnitFrameData {
  /** level, or null to show "no record" (D-029) */
  level?: number | null;
  /** replaces the level line, for example "Lv 12 到 15" or a strength reading */
  levelText?: string;
  hp?: BarView;
  resources?: ResourceBarView[];
  auras?: AuraView[];
  cast?: CastView | null;
  dead?: boolean;
  /** extra line under the name: job, title, tier name */
  subtitle?: string;
  /** a felt-pressure description (no numbers) */
  pressure?: string;
  /** the last appraisal's display ("无记载", "Lv12", ...) */
  appraisal?: string;
  /** experience toward the next level (player frame) */
  xp?: BarView;
  hostile?: boolean;
}

export interface UnitFrameAdapter {
  unitFrame(view: GameView, entityId: string, viewerId: string): UnitFrameData | null;
}

// ---------------------------------------------------------------------------
// Combat: hotbar, targeting, animation cues, floating combat text

export interface HotbarSlotView {
  /** 1..9 */
  slot: number;
  abilityId: string | null;
  name: string;
  desc?: string;
  /** seconds left on cooldown or global cooldown, and the full span for the sweep */
  cooldown: number;
  cooldownTotal: number;
  usable: boolean;
  /** why it cannot be used right now */
  reason?: string;
  /** cost text, for example "20 灵力" */
  cost?: string;
}

export interface AnimCue {
  entityId: string;
  anim: 'attack' | 'hit';
}

export interface FloatingTextView {
  entityId: string;
  text: string;
  /** damage, damage_taken, heal, crit, miss, xp, loot, level */
  kind: string;
}

export interface CombatAdapter {
  hotbar(view: GameView): HotbarSlotView[];
  /** Commands for a hotbar press, or a Chinese reason it cannot be used. */
  activateSlot(view: GameView, slot: number, targetId: string | null): Commands | string;
  /** Tell the combat system about a target change. */
  selectTarget(view: GameView, targetId: string | null): Commands;
  /** Next hostile target for Tab (nearest first, cycling). */
  nextEnemy(view: GameView, current: string | null): string | null;
  /** False while rooted, stunned or feared: the client drops movement input. */
  canMove(view: GameView): boolean;
  /** Attack and hit animations for an event (pure presentation). */
  animationCues(view: GameView, event: AnyWorldEvent): AnimCue[];
  floatingText(view: GameView, event: AnyWorldEvent): FloatingTextView[];
  isHostile(view: GameView, entityId: string): boolean;
}

// ---------------------------------------------------------------------------
// Interaction, conversation, scenes, trade

export interface InteractAdapter {
  /** E key or double click on a target: talk, attack. Null when nothing applies. */
  interact(view: GameView, targetId: string | null): Commands | null;
  /** Prompt text near an entity, for example "E 交谈". */
  prompt(view: GameView, entityId: string): string | null;
  /** Nearest entity the player could talk to right now. */
  nearestTalkable(view: GameView): string | null;
}

export interface ConversationLineView {
  speakerId: string;
  speakerName: string;
  text: string;
  kind: string;
}

export interface ConversationOptionView {
  /** the id dialogue.choose takes */
  id: string;
  label: string;
  hint?: string;
  system: string;
}

export interface ConversationView {
  npcId: string;
  name: string;
  lines: ConversationLineView[];
  options: ConversationOptionView[];
  pending: boolean;
}

export interface ConversationAdapter {
  conversation(view: GameView): ConversationView | null;
  choose(view: GameView, optionId: string): Commands;
  say(view: GameView, text: string): Commands;
  close(view: GameView): Commands;
  /** maximum free-text length */
  readonly maxSay: number;
}

export interface SceneAdapter {
  scene(view: GameView): SceneView | null;
  advance(view: GameView): Commands;
  choose(view: GameView, choiceId: string): Commands;
  input(view: GameView, text: string): Commands;
}

export interface TradeAdapter {
  session(view: GameView): TradeSessionView | null;
  buy(view: GameView, itemId: string, qty: number): Commands;
  sell(view: GameView, itemId: string, qty: number): Commands;
  close(view: GameView): Commands;
}

// ---------------------------------------------------------------------------
// World overlays

export interface OverheadAdapter {
  /** Overhead glyphs; the renderer shows the highest-priority one. */
  markers(view: GameView, entityId: string): MarkerKind[];
}

export interface MapMarkerView {
  x: number;
  y: number;
  kind: 'quest' | 'turn_in' | 'poi' | 'danger' | 'companion';
  label?: string;
}

export interface MapMarkerAdapter {
  markers(view: GameView, mapId: string): MapMarkerView[];
}

export interface LightSourceView {
  id: string;
  x: number;
  y: number;
  /** tiles */
  radius: number;
  /** 0xRRGGBB */
  color: number;
  intensity?: number;
}

export interface LightAdapter {
  lights(view: GameView, mapId: string): LightSourceView[];
}

/** Extra message-log lines for system-owned events (combat, quests, rumors, ...). */
export interface LogAdapter {
  format(view: GameView, event: AnyWorldEvent): { text: string; category: string } | null;
}

/** Full-screen announcements: the Maker's revelations, act titles, battle results. */
export interface BannerView {
  title: string;
  text: string;
  /** maker: colourless; act: gold; battle: red */
  kind: 'maker' | 'act' | 'battle' | 'door';
}

export interface BannerAdapter {
  banner(view: GameView, event: AnyWorldEvent): BannerView | null;
}

// ---------------------------------------------------------------------------
// Windows

export interface CharacterSheetView {
  name: string;
  className?: string;
  level: number | null;
  tierName?: string;
  xp?: BarView;
  hp?: BarView;
  resources: ResourceBarView[];
  stats: { label: string; value: string }[];
  abilities: { id: string; name: string; desc: string; cost?: string; cooldown?: string }[];
}

export interface CharacterAdapter {
  sheet(view: GameView): CharacterSheetView | null;
}

export interface DoorsAdapter {
  doors(view: GameView): DoorView[];
  open(view: GameView, doorId: string): Commands;
  close(view: GameView, doorId: string): Commands;
}

export interface QuestsAdapter {
  log(view: GameView): QuestLogView;
  /** answer a choice objective from the log */
  choose(view: GameView, questId: string, optionId: string): Commands;
}

export interface RumorsAdapter {
  rumors(view: GameView): RumorBookEntry[];
  reputation(view: GameView): { regions: Reputation[]; factions: Reputation[] };
}

export interface PartyAdapter {
  companions(view: GameView): CompanionView[];
  order(view: GameView, companionId: string | undefined, order: PartyOrder): Commands;
}

export interface CompanyAdapter {
  company(view: GameView): CompanyView;
  found(view: GameView): Commands;
  funds(view: GameView, amount: number): Commands;
  produce(view: GameView, recipeId: string, runs: number): Commands;
}

export interface SiteSummary {
  id: string;
  name: string;
  mapId: string;
  founded: boolean;
  usable: boolean;
}

export interface TerritoryAdapter {
  sites(view: GameView): SiteSummary[];
  settlement(view: GameView, siteId: string): SettlementView | null;
  buildMenu(
    view: GameView,
    siteId: string,
  ): {
    id: string;
    name: string;
    desc: string;
    w: number;
    h: number;
    cost: string;
    available: boolean;
    reason: string;
  }[];
  preview(view: GameView, siteId: string, defId: string, x: number, y: number): PlacementResult;
  found(view: GameView, siteId: string): Commands;
  place(view: GameView, siteId: string, defId: string, x: number, y: number): Commands;
  cancel(view: GameView, siteId: string, buildingId: string): Commands;
  policy(view: GameView, siteId: string, policyId: string, enabled: boolean): Commands;
  enterCourt(view: GameView): Commands;
  leaveCourt(view: GameView): Commands;
}

export interface WarOrderSpec {
  unitId: string;
  kind: 'move' | 'attack' | 'hold' | 'retreat' | 'formation';
  x?: number;
  y?: number;
  targetId?: string;
  formation?: Formation;
}

export interface BattleAdapter {
  battle(view: GameView): BattleView | null;
  /** set while flag war.pending waits for the player */
  pending(view: GameView): { id: string; name: string; desc: string; scale: string } | null;
  start(view: GameView, scenarioId: string): Commands;
  order(view: GameView, order: WarOrderSpec): Commands;
  heroAbility(
    view: GameView,
    heroId: string,
    abilityId: string,
    target: { targetId?: string; x?: number; y?: number },
  ): Commands;
  retreat(view: GameView): Commands;
  autoResolve(view: GameView, scenarioId?: string): Commands;
}

export interface StrategyAdapter {
  continent(view: GameView): ContinentView;
  nation(view: GameView, id: string): NationView | null;
  diplomacy(view: GameView): DiplomacyRow[];
  /** recruitable regiment types for a province the player owns */
  recruitOptions(view: GameView, provinceId: string): { typeId: string; name: string }[];
  moveArmy(view: GameView, armyId: string, to: string): Commands;
  recruit(view: GameView, provinceId: string, typeId: string, count: number): Commands;
  diplomacyAct(view: GameView, to: string, action: DiplomacyAction, treaty?: TreatyType): Commands;
  foundNation(view: GameView, name?: string): Commands;
  convene(view: GameView): Commands;
  setBattleMode(view: GameView, mode: 'auto' | 'manual'): Commands;
}

export interface GoddessAdapter {
  goddesses(view: GameView): GoddessView[];
  record(view: GameView): MiracleEntry[];
  revelations(view: GameView): { id: string; text: string; literal: string }[];
  /** whether the coin offering is possible at all (holding Merca's coin) */
  canOffer(view: GameView): boolean;
  offer(view: GameView, itemId: string, want: 'blessing' | 'intel'): Commands;
}

export interface AppraiseAdapter {
  appraise(view: GameView, targetId: string): Commands;
  /** the latest appraisal of this target by the player */
  last(view: GameView, targetId: string): AppraisalResult | undefined;
  pressure(view: GameView, targetId: string): PressureSense | null;
}

// ---------------------------------------------------------------------------

export interface ClientAdapters {
  unitFrames?: UnitFrameAdapter;
  combat?: CombatAdapter;
  interact?: InteractAdapter;
  conversation?: ConversationAdapter;
  scene?: SceneAdapter;
  trade?: TradeAdapter;
  overhead?: OverheadAdapter;
  mapMarkers?: MapMarkerAdapter;
  lights?: LightAdapter;
  log?: LogAdapter[];
  banner?: BannerAdapter;
  character?: CharacterAdapter;
  doors?: DoorsAdapter;
  quests?: QuestsAdapter;
  rumors?: RumorsAdapter;
  party?: PartyAdapter;
  company?: CompanyAdapter;
  territory?: TerritoryAdapter;
  battle?: BattleAdapter;
  strategy?: StrategyAdapter;
  goddess?: GoddessAdapter;
  appraise?: AppraiseAdapter;
}

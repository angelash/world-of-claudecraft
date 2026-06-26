import type { KnownAbility } from '../../src/sim/content/classes';
import type { TalentAllocation } from '../../src/sim/content/talents';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import {
  CAMPS,
  CLASSES,
  DUNGEONS,
  INSTANCE_SLOT_COUNT,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  abilitiesKnownAt,
  dungeonAt,
  instanceOrigin,
  zoneAt,
} from '../../src/sim/data';
import { findPlayerPath, resolvePlayerDestination } from '../../src/sim/pathfind';
import {
  INTERACT_RANGE,
  MELEE_RANGE,
  angleTo,
  dist2d,
  type InvSlot,
  type QuestProgress,
} from '../../src/sim/types';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';
import {
  AMBIENT_BOT_SOLO_QUEST_ROUTES,
  type AmbientBotPoint2d,
  type AmbientBotQuestRoute,
} from './progression_routes';

const DEFAULT_WORLD_SEED = 20_061;
const PATH_NODE_REACHED_RANGE = 2.2;
const CAMP_ARRIVAL_RANGE = 7;
const MOB_SEARCH_RADIUS = 55;
const STUCK_PROGRESS_DISTANCE = 0.75;
const STUCK_TIMEOUT_MS = 4_000;
const NO_TARGET_ROTATE_MS = 5_000;
const COMMAND_COOLDOWN_MS = 900;
const RECOVERY_HP_THRESHOLD = 0.55;
const RECOVERY_MANA_THRESHOLD = 0.45;
const FOOD_RESTOCK_TRIGGER_COUNT = 2;
const FOOD_RESTOCK_TARGET_COUNT = 4;
const DRINK_RESTOCK_TRIGGER_COUNT = 2;
const DRINK_RESTOCK_TARGET_COUNT = 4;

interface AmbientBotVendorProfile {
  vendorNpcTemplateId: string;
  foodItemId: string;
  drinkItemId: string;
}

const EASTBROOK_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'trader_wilkes',
  foodItemId: 'baked_bread',
  drinkItemId: 'spring_water',
};

const FENBRIDGE_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'provisioner_hale',
  foodItemId: 'fenbridge_rye',
  drinkItemId: 'marsh_mint_tea',
};

const HIGHWATCH_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'quartermaster_bree',
  foodItemId: 'trail_hardtack',
  drinkItemId: 'meltwater_flask',
};

type BrainCommand = Record<string, unknown>;
type MoveInputPayload = Record<string, 1>;

type BotPoint2d = AmbientBotPoint2d;

interface BotVec3 extends BotPoint2d {
  y: number;
}

interface BotEntityView {
  id: number;
  kind: string;
  templateId: string;
  objectItemId: string | null;
  pos: BotVec3;
  level: number;
  dead: boolean;
  lootable: boolean;
  hostile: boolean;
  aggroTargetId: number | null;
}

interface BotSelfView {
  id: number;
  pos: BotVec3;
  level: number;
  dungeonId: string | null;
  copper: number;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  resourceType: string;
  targetId: number | null;
  autoAttack: boolean;
  gcdRemaining: number;
  cooldowns: Record<string, number>;
  castingAbility: string | null;
  eatingRemaining: number | null;
  drinkingRemaining: number | null;
  inventory: InvSlot[];
  questLog: Map<string, QuestProgress>;
  questsDone: Set<string>;
  talents: TalentAllocation | null;
}

interface BotWorldView {
  self: BotSelfView;
  entities: readonly BotEntityView[];
}

interface AmbientBotObjective {
  id: string;
  label: string;
  questId?: string;
  mobId?: string;
  alternateMobIds?: readonly string[];
  objectItemId?: string;
  camps?: readonly BotPoint2d[];
  npcTemplateId?: string;
  allowAnyHostileFallback?: boolean;
  vendorPurchases?: readonly AmbientBotVendorPurchase[];
  dungeonId?: string;
  suggestedPartySize?: number;
  leaveDungeon?: boolean;
}

interface AmbientBotVendorPurchase {
  itemId: string;
  targetCount: number;
}

export interface AmbientPlayerBotBrainState {
  objectiveId: string | null;
  objectiveSinceMs: number | null;
  lastProgressAtMs: number | null;
  lastX: number | null;
  lastZ: number | null;
  pathGoalKey: string | null;
  path: BotPoint2d[];
  campIndex: number;
  noTargetSinceMs: number | null;
  stuckResets: number;
  lastCommandAtMs: Record<string, number>;
}

export interface AmbientPlayerBotBrainTickInput {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  nowMs: number;
}

export interface AmbientPlayerBotBrainTickResult {
  objectiveId: string;
  objectiveLabel: string;
  moveInput: MoveInputPayload;
  facing?: number;
  commands: readonly BrainCommand[];
  objectiveQuestId?: string;
  objectiveDungeonId?: string;
  objectiveSuggestedPartySize?: number;
}

interface CombatAbility {
  id: string;
  range: number;
  minRange: number;
  castTime: number;
  cost: number;
}

export function createAmbientPlayerBotBrainState(): AmbientPlayerBotBrainState {
  return {
    objectiveId: null,
    objectiveSinceMs: null,
    lastProgressAtMs: null,
    lastX: null,
    lastZ: null,
    pathGoalKey: null,
    path: [],
    campIndex: 0,
    noTargetSinceMs: null,
    stuckResets: 0,
    lastCommandAtMs: {},
  };
}

export function tickAmbientPlayerBotBrain(
  input: AmbientPlayerBotBrainTickInput,
  state: AmbientPlayerBotBrainState,
): AmbientPlayerBotBrainTickResult {
  const view = buildWorldView(input.liveState);
  if (!view) return idleStep('waiting_for_snapshot', 'Waiting for snapshot');

  const { self } = view;
  const objective = chooseObjective(view);
  beginObjective(state, objective.id, input.nowMs, self.pos);

  if (objective.id === 'release') {
    const commands: BrainCommand[] = [];
    if (canIssue(state, 'release', input.nowMs, 3_000)) commands.push({ cmd: 'release' });
    return finalizeStep(state, input, view, objective, idleStep(objective.id, objective.label, commands));
  }

  const recovery = maybeRecover(view, state, input.nowMs);
  if (recovery) {
    beginObjective(state, 'recover', input.nowMs, self.pos);
    return finalizeStep(
      state,
      input,
      view,
      { id: 'recover', label: 'Recovering between pulls' },
      recovery,
    );
  }

  const loot = maybeLootNearby(view, state, input.nowMs);
  if (loot) return finalizeStep(state, input, view, objective, loot);

  const threat = findThreateningMob(view);
  if (threat) {
    const threatStep = fightTarget(view, input.bot, threat, state, input.nowMs, objective.label);
    return finalizeStep(state, input, view, objective, threatStep);
  }

  if (objective.id === 'recover') {
    return finalizeStep(state, input, view, objective, idleStep(objective.id, objective.label));
  }
  if (objective.dungeonId && !objective.mobId && !objective.objectItemId && !objective.npcTemplateId) {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      handleDungeonObjective(view, state, input, objective),
    );
  }
  if (objective.id === 'sell_junk') {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      handleVendorObjective(view, state, input, objective),
    );
  }
  if (objective.objectItemId) {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      collectObject(view, state, input, objective),
    );
  }
  if (objective.mobId) {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      huntMob(view, input, state, objective),
    );
  }
  if (objective.npcTemplateId) {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      objective.vendorPurchases
        ? handleVendorObjective(view, state, input, objective)
        : interactWithNpc(view, state, input, objective),
    );
  }
  return finalizeStep(state, input, view, objective, idleStep(objective.id, objective.label));
}

function chooseObjective(view: BotWorldView): AmbientBotObjective {
  if (view.self.hp <= 0) return { id: 'release', label: 'Releasing spirit' };

  const questObjective = chooseQuestObjective(view);
  const resupplyObjective = chooseResupplyObjective(view, questObjective);
  if (resupplyObjective) return resupplyObjective;
  if (questObjective) return questObjective;

  if (inventoryHasJunk(view.self.inventory)) {
    const vendorProfile = vendorProfileFor(view.self);
    return {
      id: 'sell_junk',
      label: 'Vendoring poor-quality loot',
      npcTemplateId: vendorProfile.vendorNpcTemplateId,
    };
  }

  const grind = grindRouteForSelf(view.self);
  return {
    id: 'grind',
    label: `Grinding ${displayMobName(grind.mobId)}`,
    mobId: grind.mobId,
    camps: grind.camps,
    allowAnyHostileFallback: true,
  };
}

function chooseResupplyObjective(
  view: BotWorldView,
  questObjective: AmbientBotObjective | null,
): AmbientBotObjective | null {
  if (questObjective?.npcTemplateId) return null;
  const vendorProfile = vendorProfileFor(view.self);
  const vendorPurchases = buildVendorPurchases(view.self, vendorProfile);
  if (vendorPurchases.length === 0) return null;
  return {
    id: vendorPurchases.length > 1 ? 'restock_food_and_drink' : `restock_${vendorPurchases[0].itemId}`,
    label: resupplyLabel(vendorPurchases),
    npcTemplateId: vendorProfile.vendorNpcTemplateId,
    vendorPurchases,
  };
}

function chooseQuestObjective(view: BotWorldView): AmbientBotObjective | null {
  const readyRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteReady(route, view));
  if (readyRoute) {
    if (readyRoute.dungeonId && view.self.dungeonId === readyRoute.dungeonId) {
      return dungeonExitObjective(readyRoute);
    }
    return {
      id: readyRoute.turnInObjectiveId,
      label: readyRoute.turnInLabel,
      questId: readyRoute.questId,
      npcTemplateId: readyRoute.turnInNpcTemplateId,
    };
  }

  const activeRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteActive(route, view));
  if (activeRoute) {
    if (activeRoute.dungeonId && view.self.dungeonId !== activeRoute.dungeonId) {
      return dungeonEntryObjective(activeRoute);
    }
    const activeCamps = activeRoute.dungeonId
      ? resolveDungeonRouteCamps(view.self, activeRoute)
      : activeRoute.camps;
    return {
      id: activeRoute.activeObjectiveId,
      label: activeRoute.activeLabel,
      questId: activeRoute.questId,
      camps: activeCamps,
      ...(activeRoute.dungeonId ? { dungeonId: activeRoute.dungeonId } : {}),
      ...(activeRoute.suggestedPartySize
        ? { suggestedPartySize: activeRoute.suggestedPartySize }
        : {}),
      ...(activeRoute.kind === 'kill'
        ? {
            mobId: activeRoute.mobId,
            ...(activeRoute.alternateMobIds ? { alternateMobIds: activeRoute.alternateMobIds } : {}),
            allowAnyHostileFallback: activeRoute.allowAnyHostileFallback ?? false,
          }
        : {
            objectItemId: activeRoute.objectItemId,
          }),
    };
  }

  const availableRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteAvailable(route, view));
  if (!availableRoute) return null;
  return {
    id: availableRoute.acceptObjectiveId,
    label: availableRoute.acceptLabel,
    questId: availableRoute.questId,
    npcTemplateId: availableRoute.giverNpcTemplateId,
  };
}

function isQuestRouteReady(
  route: AmbientBotQuestRoute,
  view: BotWorldView,
): boolean {
  const progress = view.self.questLog.get(route.questId);
  if (view.self.questsDone.has(route.questId) || progress?.state === 'done') return false;
  if (progress?.state !== 'ready') return false;
  return !route.deferReadyWhileQuestIdsActive?.some((questId) => {
    const otherProgress = view.self.questLog.get(questId);
    return otherProgress?.state === 'active';
  });
}

function isQuestRouteActive(
  route: AmbientBotQuestRoute,
  view: BotWorldView,
): boolean {
  const progress = view.self.questLog.get(route.questId);
  if (!progress || progress.state !== 'active') return false;
  if (route.acceptBeforeActiveQuestIds?.some((questId) => isStandaloneQuestAvailable(questId, view))) {
    return false;
  }
  return routeObjectiveNeedsWork(route, progress);
}

function isQuestRouteAvailable(
  route: AmbientBotQuestRoute,
  view: BotWorldView,
): boolean {
  const progress = view.self.questLog.get(route.questId);
  if (view.self.questsDone.has(route.questId) || progress) return false;
  const quest = QUESTS[route.questId];
  if (!quest) return false;
  const minLevel = Math.max(quest.minLevel ?? 1, route.pursueAtLevel);
  if (view.self.level < minLevel) return false;
  if (quest.requiresQuest && !view.self.questsDone.has(quest.requiresQuest)) return false;
  return true;
}

function routeObjectiveNeedsWork(
  route: AmbientBotQuestRoute,
  progress: QuestProgress,
): boolean {
  if (route.questObjectiveIndex === undefined) return true;
  const objective = QUESTS[route.questId]?.objectives[route.questObjectiveIndex];
  if (!objective) return true;
  return (progress.counts[route.questObjectiveIndex] ?? 0) < objective.count;
}

function isStandaloneQuestAvailable(
  questId: string,
  view: BotWorldView,
): boolean {
  const progress = view.self.questLog.get(questId);
  if (view.self.questsDone.has(questId) || progress) return false;
  const quest = QUESTS[questId];
  if (!quest) return false;
  if (view.self.level < (quest.minLevel ?? 1)) return false;
  if (quest.requiresQuest && !view.self.questsDone.has(quest.requiresQuest)) return false;
  return true;
}

function dungeonEntryObjective(route: AmbientBotQuestRoute): AmbientBotObjective {
  const dungeon = route.dungeonId ? DUNGEONS[route.dungeonId] : null;
  return {
    id: `enter_${route.questId.slice(2)}`,
    label: `Gathering a party for ${questLabel(route.questId)}`,
    questId: route.questId,
    camps: dungeon ? [dungeon.doorPos] : [],
    ...(route.dungeonId ? { dungeonId: route.dungeonId } : {}),
    ...(route.suggestedPartySize ? { suggestedPartySize: route.suggestedPartySize } : {}),
  };
}

function dungeonExitObjective(route: AmbientBotQuestRoute): AmbientBotObjective {
  const dungeon = route.dungeonId ? DUNGEONS[route.dungeonId] : null;
  return {
    id: `leave_${route.questId.slice(2)}`,
    label: dungeon
      ? `Leaving ${dungeon.name} for turn-in`
      : `Leaving the dungeon for ${questLabel(route.questId)}`,
    questId: route.questId,
    ...(route.dungeonId ? { dungeonId: route.dungeonId } : {}),
    ...(route.suggestedPartySize ? { suggestedPartySize: route.suggestedPartySize } : {}),
    leaveDungeon: true,
  };
}

function resolveDungeonRouteCamps(
  self: BotSelfView,
  route: AmbientBotQuestRoute,
): AmbientBotPoint2d[] {
  if (!route.dungeonId || self.dungeonId !== route.dungeonId) return [...route.camps];
  const dungeon = DUNGEONS[route.dungeonId];
  if (!dungeon) return [...route.camps];
  const origin = instanceOrigin(dungeon.index, currentInstanceSlot(self.pos.z));
  return route.camps.map((point) => ({
    x: origin.x + point.x,
    z: origin.z + point.z,
  }));
}

function currentInstanceSlot(z: number): number {
  return Math.max(0, Math.min(INSTANCE_SLOT_COUNT - 1, Math.round((z + 1250) / 500)));
}

function buildVendorPurchases(
  self: BotSelfView,
  vendorProfile: AmbientBotVendorProfile,
): AmbientBotVendorPurchase[] {
  const purchases: AmbientBotVendorPurchase[] = [];
  const canSellJunk = inventoryHasJunk(self.inventory);
  if (
    countConsumables(self.inventory, 'food') < FOOD_RESTOCK_TRIGGER_COUNT
    && canAffordVendorItem(self.copper, vendorProfile.foodItemId, canSellJunk)
  ) {
    purchases.push({ itemId: vendorProfile.foodItemId, targetCount: FOOD_RESTOCK_TARGET_COUNT });
  }
  if (
    self.resourceType === 'mana'
    && countConsumables(self.inventory, 'drink') < DRINK_RESTOCK_TRIGGER_COUNT
    && canAffordVendorItem(self.copper, vendorProfile.drinkItemId, canSellJunk)
  ) {
    purchases.push({ itemId: vendorProfile.drinkItemId, targetCount: DRINK_RESTOCK_TARGET_COUNT });
  }
  return purchases;
}

function vendorProfileFor(self: BotSelfView): AmbientBotVendorProfile {
  const zoneId = zoneAt(self.pos.z).id;
  if (zoneId === 'thornpeak_heights') return HIGHWATCH_VENDOR_PROFILE;
  return zoneId === 'mirefen_marsh'
    ? FENBRIDGE_VENDOR_PROFILE
    : EASTBROOK_VENDOR_PROFILE;
}

function canAffordVendorItem(
  copper: number,
  itemId: string,
  canSellJunk: boolean,
): boolean {
  const price = ITEMS[itemId]?.buyValue ?? 0;
  return price > 0 && (copper >= price || canSellJunk);
}

function resupplyLabel(purchases: readonly AmbientBotVendorPurchase[]): string {
  const labels = purchases.map((purchase) => ITEMS[purchase.itemId]?.name ?? purchase.itemId);
  return labels.length > 0
    ? `Restocking ${labels.join(' and ')}`
    : 'Restocking supplies';
}

function maybeRecover(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  nowMs: number,
): AmbientPlayerBotBrainTickResult | null {
  const commands: BrainCommand[] = [];
  const hpRatio = view.self.maxHp > 0 ? view.self.hp / view.self.maxHp : 1;
  if (view.self.eatingRemaining !== null || view.self.drinkingRemaining !== null) {
    return idleStep('recover', 'Recovering between pulls');
  }
  if (hpRatio < RECOVERY_HP_THRESHOLD) {
    const food = findConsumable(view.self.inventory, 'food');
    if (food && canIssue(state, `use:${food}`, nowMs, 3_000)) commands.push({ cmd: 'use', item: food });
  }
  if (view.self.resourceType === 'mana' && view.self.maxResource > 0) {
    const manaRatio = view.self.resource / view.self.maxResource;
    if (manaRatio < RECOVERY_MANA_THRESHOLD) {
      const drink = findConsumable(view.self.inventory, 'drink');
      if (drink && canIssue(state, `use:${drink}`, nowMs, 3_000)) commands.push({ cmd: 'use', item: drink });
    }
  }
  return commands.length > 0 ? idleStep('recover', 'Recovering between pulls', commands) : null;
}

function maybeLootNearby(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  nowMs: number,
): AmbientPlayerBotBrainTickResult | null {
  const corpse = findNearbyCorpse(view);
  if (!corpse || !canIssue(state, `loot:${corpse.id}`, nowMs, 1_000)) return null;
  const commands: BrainCommand[] = [];
  if (view.self.targetId !== corpse.id && canIssue(state, `target:${corpse.id}`, nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: corpse.id });
  }
  commands.push({ cmd: 'loot', id: corpse.id });
  return idleStep('loot', 'Looting a nearby corpse', commands, facingFor(view.self.pos, corpse.pos));
}

function interactWithNpc(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  const npc = objective.npcTemplateId ? findNpc(view, objective.npcTemplateId) : null;
  const fallback = objective.npcTemplateId ? npcFallbackPoint(objective.npcTemplateId) : null;
  const target = npc?.pos ?? fallback;
  if (!target) return idleStep(objective.id, objective.label);
  if (dist2d(view.self.pos, pointToVec(target)) > INTERACT_RANGE + 1.5) {
    return travelToPoint(view, state, input, objective, target, INTERACT_RANGE + 1.5, `npc:${objective.npcTemplateId}`);
  }
  const commands: BrainCommand[] = [];
  if (npc && view.self.targetId !== npc.id && canIssue(state, `target:${npc.id}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: npc.id });
  }
  if (canIssue(state, `interact:${objective.npcTemplateId}`, input.nowMs, 1_500)) {
    commands.push({ cmd: 'interact' });
  }
  return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, pointToVec(target)));
}

function handleVendorObjective(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  const npc = objective.npcTemplateId ? findNpc(view, objective.npcTemplateId) : null;
  const fallback = objective.npcTemplateId ? npcFallbackPoint(objective.npcTemplateId) : null;
  const target = npc?.pos ?? fallback;
  if (!target) return idleStep(objective.id, objective.label);
  if (dist2d(view.self.pos, pointToVec(target)) > INTERACT_RANGE + 1.5) {
    return travelToPoint(view, state, input, objective, target, INTERACT_RANGE + 1.5, `vendor:${objective.npcTemplateId}`);
  }
  const commands: BrainCommand[] = [];
  if (npc && view.self.targetId !== npc.id && canIssue(state, `target:${npc.id}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: npc.id });
  }
  if (inventoryHasJunk(view.self.inventory) && canIssue(state, 'sell_all_junk', input.nowMs, 5_000)) {
    commands.push({ cmd: 'sell_all_junk' });
  } else if (npc && objective.vendorPurchases) {
    const purchase = nextVendorPurchase(objective.vendorPurchases, view.self.inventory);
    if (purchase && canIssue(state, `buy:${purchase.itemId}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
      commands.push({ cmd: 'buy', npc: npc.id, item: purchase.itemId });
    }
  }
  return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, pointToVec(target)));
}

function handleDungeonObjective(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  const dungeonId = objective.dungeonId;
  if (!dungeonId) return idleStep(objective.id, objective.label);
  if (objective.leaveDungeon) {
    if (view.self.dungeonId !== dungeonId) return idleStep(objective.id, objective.label);
    const exitPoint = dungeonExitPoint(view.self, dungeonId);
    if (!exitPoint) return idleStep(objective.id, objective.label);
    if (dist2d(view.self.pos, pointToVec(exitPoint)) > INTERACT_RANGE + 1.5) {
      return travelToPoint(
        view,
        state,
        input,
        objective,
        exitPoint,
        INTERACT_RANGE + 1.5,
        `leave:${dungeonId}`,
      );
    }
    const commands: BrainCommand[] = [];
    if (canIssue(state, `leave_dungeon:${dungeonId}`, input.nowMs, 2_000)) {
      commands.push({ cmd: 'leave_dungeon' });
    }
    return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, pointToVec(exitPoint)));
  }

  const dungeon = DUNGEONS[dungeonId];
  if (!dungeon) return idleStep(objective.id, objective.label);
  if (view.self.dungeonId === dungeonId) return idleStep(objective.id, objective.label);
  if (dist2d(view.self.pos, pointToVec(dungeon.doorPos)) > INTERACT_RANGE + 2) {
    return travelToPoint(
      view,
      state,
      input,
      objective,
      dungeon.doorPos,
      INTERACT_RANGE + 2,
      `enter:${dungeonId}`,
    );
  }
  return idleStep(objective.id, objective.label, [], facingFor(view.self.pos, pointToVec(dungeon.doorPos)));
}

function nextVendorPurchase(
  purchases: readonly AmbientBotVendorPurchase[],
  inventory: readonly InvSlot[],
): AmbientBotVendorPurchase | null {
  for (const purchase of purchases) {
    if (countItemInInventory(inventory, purchase.itemId) < purchase.targetCount) return purchase;
  }
  return null;
}

function huntMob(
  view: BotWorldView,
  input: AmbientPlayerBotBrainTickInput,
  state: AmbientPlayerBotBrainState,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  const preferredMobIds = objective.mobId
    ? [objective.mobId, ...(objective.alternateMobIds ?? [])]
    : [...(objective.alternateMobIds ?? [])];
  const currentTarget = currentRouteHostileTarget(view, preferredMobIds);
  const target =
    currentTarget
    ?? nearestHostileMobByPriority(view, preferredMobIds)
    ?? (objective.allowAnyHostileFallback ? nearestAnyHostileMob(view) : null);
  if (target) {
    state.noTargetSinceMs = null;
    return fightTarget(view, input.bot, target, state, input.nowMs, objective.label);
  }

  const camps = objective.camps ?? [];
  if (camps.length === 0) return idleStep(objective.id, objective.label);
  const camp = camps[state.campIndex % camps.length];
  const distance = dist2d(view.self.pos, pointToVec(camp));
  if (distance <= CAMP_ARRIVAL_RANGE) {
    if (state.noTargetSinceMs === null) state.noTargetSinceMs = input.nowMs;
    if (input.nowMs - state.noTargetSinceMs >= NO_TARGET_ROTATE_MS) {
      state.noTargetSinceMs = input.nowMs;
      state.campIndex = (state.campIndex + 1) % camps.length;
      clearPath(state);
    }
  } else {
    state.noTargetSinceMs = null;
  }
  const activeCamp = camps[state.campIndex % camps.length];
  return travelToPoint(
    view,
    state,
    input,
    objective,
    activeCamp,
    CAMP_ARRIVAL_RANGE,
    `camp:${objective.mobId ?? 'mob'}:${state.campIndex % camps.length}`,
  );
}

function collectObject(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  const preferredItemId = objective.objectItemId;
  const currentTarget = currentTargetObject(view, preferredItemId ?? null);
  const target = currentTarget ?? (preferredItemId ? nearestObject(view, preferredItemId) : null);
  if (target) {
    state.noTargetSinceMs = null;
    const facing = facingFor(view.self.pos, target.pos);
    if (dist2d(view.self.pos, target.pos) > INTERACT_RANGE + 1.5) {
      return travelToPoint(
        view,
        state,
        input,
        objective,
        { x: target.pos.x, z: target.pos.z },
        INTERACT_RANGE + 1.5,
        `object:${preferredItemId ?? 'item'}:${target.id}`,
      );
    }
    const commands: BrainCommand[] = [];
    if (view.self.targetId !== target.id && canIssue(state, `target:${target.id}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
      commands.push({ cmd: 'target', id: target.id });
    }
    if (canIssue(state, `interact_object:${target.id}`, input.nowMs, 1_500)) {
      commands.push({ cmd: 'interact' });
    }
    return idleStep(objective.id, objective.label, commands, facing);
  }

  const camps = objective.camps ?? [];
  if (camps.length === 0) return idleStep(objective.id, objective.label);
  const point = camps[state.campIndex % camps.length];
  const distance = dist2d(view.self.pos, pointToVec(point));
  if (distance <= CAMP_ARRIVAL_RANGE) {
    if (state.noTargetSinceMs === null) state.noTargetSinceMs = input.nowMs;
    if (input.nowMs - state.noTargetSinceMs >= NO_TARGET_ROTATE_MS) {
      state.noTargetSinceMs = input.nowMs;
      state.campIndex = (state.campIndex + 1) % camps.length;
      clearPath(state);
    }
  } else {
    state.noTargetSinceMs = null;
  }
  const activePoint = camps[state.campIndex % camps.length];
  return travelToPoint(
    view,
    state,
    input,
    objective,
    activePoint,
    CAMP_ARRIVAL_RANGE,
    `objectcamp:${preferredItemId ?? 'item'}:${state.campIndex % camps.length}`,
  );
}

function fightTarget(
  view: BotWorldView,
  bot: AmbientPlayerBotRecord,
  target: BotEntityView,
  state: AmbientPlayerBotBrainState,
  nowMs: number,
  label: string,
): AmbientPlayerBotBrainTickResult {
  const preferredAbility = pickCombatAbility(bot, view.self, false);
  const distance = dist2d(view.self.pos, target.pos);
  const usableAbility = pickCombatAbility(bot, view.self, true);
  const rangedPreferred =
    preferredAbility
    && canAfford(preferredAbility, view.self)
    && distance > preferredAbility.minRange + 0.25;
  const preferredRange = rangedPreferred
    ? desiredCombatRange(preferredAbility)
    : MELEE_RANGE * 0.9;
  const facing = facingFor(view.self.pos, target.pos);
  const commands: BrainCommand[] = [];
  const rangedUsable = usableAbility && abilityMatchesDistance(usableAbility, distance)
    ? usableAbility
    : null;

  if (view.self.targetId !== target.id && canIssue(state, `target:${target.id}`, nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: target.id });
  }

  if (view.self.castingAbility) {
    return idleStep('combat', label, commands, facing);
  }

  if (distance > preferredRange) {
    return moveStep('combat', label, facing, commands);
  }

  if (
    rangedPreferred &&
    preferredAbility.range > MELEE_RANGE + 1 &&
    distance > MELEE_RANGE + 0.5 &&
    view.self.autoAttack &&
    canIssue(state, 'stopattack', nowMs, 1_500)
  ) {
    commands.push({ cmd: 'stopattack' });
  }

  if (rangedUsable && canIssue(state, `cast:${rangedUsable.id}`, nowMs, rangedUsable.castTime > 0 ? 1_600 : 900)) {
    commands.push({ cmd: 'cast', ability: rangedUsable.id });
  }

  if (
    distance <= MELEE_RANGE + 0.3 &&
    !view.self.autoAttack &&
    canIssue(state, 'attack', nowMs, 1_200)
  ) {
    commands.push({ cmd: 'attack' });
  }

  if (commands.length === 0 && distance > MELEE_RANGE + 0.3) {
    return moveStep('combat', label, facing, commands);
  }
  return idleStep('combat', label, commands, facing);
}

function travelToPoint(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
  target: BotPoint2d,
  arrivalRange: number,
  goalKey: string,
): AmbientPlayerBotBrainTickResult {
  if (dist2d(view.self.pos, pointToVec(target)) <= arrivalRange) {
    clearPath(state);
    return idleStep(objective.id, objective.label, [], facingFor(view.self.pos, pointToVec(target)));
  }
  const nextPoint = ensurePath(view, state, input.liveState.seed ?? DEFAULT_WORLD_SEED, target, goalKey);
  return moveStep(objective.id, objective.label, facingFor(view.self.pos, pointToVec(nextPoint)));
}

function ensurePath(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  seed: number,
  target: BotPoint2d,
  goalKey: string,
): BotPoint2d {
  if (state.pathGoalKey !== goalKey || state.path.length === 0) {
    const resolved = resolvePlayerDestination(seed, target);
    const raw = findPlayerPath(seed, view.self.pos, resolved);
    state.pathGoalKey = goalKey;
    state.path = raw.map((point) => ({ x: point.x, z: point.z }));
    if (state.path.length === 0) state.path.push(resolved);
  }
  while (state.path.length > 0 && dist2d(view.self.pos, pointToVec(state.path[0])) <= PATH_NODE_REACHED_RANGE) {
    state.path.shift();
  }
  if (state.path.length === 0) return target;
  return state.path[0];
}

function finalizeStep(
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  view: BotWorldView,
  objective: AmbientBotObjective,
  step: AmbientPlayerBotBrainTickResult,
): AmbientPlayerBotBrainTickResult {
  const withObjective = attachObjectiveMeta(step, objective);
  const moving = !!step.moveInput.f || !!step.moveInput.b;
  if (hasProgressed(state, view.self.pos, input.nowMs, moving)) return withObjective;
  if (!moving || (state.lastProgressAtMs !== null && input.nowMs - state.lastProgressAtMs < STUCK_TIMEOUT_MS)) {
    return withObjective;
  }

  state.stuckResets++;
  state.lastProgressAtMs = input.nowMs;
  clearPath(state);
  if (objective.camps && objective.camps.length > 1) {
    state.campIndex = (state.campIndex + 1) % objective.camps.length;
  }
  const commands = [...step.commands];
  if (canIssue(state, 'stopattack', input.nowMs, 1_500)) commands.push({ cmd: 'stopattack' });
  if (canIssue(state, 'clear_target', input.nowMs, 1_500)) commands.push({ cmd: 'target', id: null });
  return attachObjectiveMeta(
    idleStep(step.objectiveId, step.objectiveLabel, commands, step.facing),
    objective,
  );
}

function attachObjectiveMeta(
  step: AmbientPlayerBotBrainTickResult,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
  return {
    ...step,
    ...(objective.questId ? { objectiveQuestId: objective.questId } : {}),
    ...(objective.dungeonId ? { objectiveDungeonId: objective.dungeonId } : {}),
    ...(objective.suggestedPartySize
      ? { objectiveSuggestedPartySize: objective.suggestedPartySize }
      : {}),
  };
}

function buildWorldView(liveState: AmbientPlayerBotLiveState): BotWorldView | null {
  const self = parseSelf(liveState.self);
  if (!self) return null;
  const entities: BotEntityView[] = [];
  for (const raw of liveState.entities.values()) {
    const entity = parseEntity(raw);
    if (entity) entities.push(entity);
  }
  return { self, entities };
}

function parseSelf(raw: Record<string, unknown> | null): BotSelfView | null {
  if (!raw) return null;
  const id = readNumber(raw.id);
  const x = readNumber(raw.x);
  const z = readNumber(raw.z);
  if (id === null || x === null || z === null) return null;
  return {
    id,
    pos: { x, y: readNumber(raw.y) ?? 0, z },
    level: readNumber(raw.lv) ?? 1,
    dungeonId: readString(raw.dgn) ?? dungeonAt(x)?.id ?? null,
    copper: readNumber(raw.copper) ?? 0,
    hp: readNumber(raw.hp) ?? 1,
    maxHp: readNumber(raw.mhp) ?? 1,
    resource: readNumber(raw.res) ?? 0,
    maxResource: readNumber(raw.mres) ?? 0,
    resourceType: readString(raw.rtype) ?? 'rage',
    targetId: readNumber(raw.target),
    autoAttack: readBoolean(raw.auto),
    gcdRemaining: readNumber(raw.gcd) ?? 0,
    cooldowns: readNumberRecord(raw.cds),
    castingAbility: readString(raw.cast),
    eatingRemaining: readNumber(readRecord(raw.eat)?.remaining),
    drinkingRemaining: readNumber(readRecord(raw.drk)?.remaining),
    inventory: readInventory(raw.inv),
    questLog: new Map(readQuestLog(raw.qlog).map((quest) => [quest.questId, quest])),
    questsDone: new Set(readStringArray(raw.qdone)),
    talents: readTalents(raw.tal),
  };
}

function parseEntity(raw: Record<string, unknown>): BotEntityView | null {
  const id = readNumber(raw.id);
  const x = readNumber(raw.x);
  const z = readNumber(raw.z);
  if (id === null || x === null || z === null) return null;
  return {
    id,
    kind: readString(raw.k) ?? '',
    templateId: readString(raw.tid) ?? '',
    objectItemId: readString(raw.obj),
    pos: { x, y: readNumber(raw.y) ?? 0, z },
    level: readNumber(raw.lv) ?? 1,
    dead: readBoolean(raw.dead),
    lootable: readBoolean(raw.loot),
    hostile: readBoolean(raw.h),
    aggroTargetId: readNumber(raw.aggro),
  };
}

function readInventory(raw: unknown): InvSlot[] {
  if (!Array.isArray(raw)) return [];
  const items: InvSlot[] = [];
  for (const slot of raw) {
    const record = readRecord(slot);
    const itemId = record ? readString(record.itemId) : null;
    const count = record ? readNumber(record.count) : null;
    if (!itemId || count === null) continue;
    items.push({ itemId, count });
  }
  return items;
}

function readQuestLog(raw: unknown): QuestProgress[] {
  if (!Array.isArray(raw)) return [];
  const quests: QuestProgress[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    const questId = record ? readString(record.questId) : null;
    const counts = record ? readNumberArray(record.counts) : [];
    const questState = record ? readString(record.state) : null;
    if (!questId || (questState !== 'active' && questState !== 'ready' && questState !== 'done')) continue;
    quests.push({ questId, counts, state: questState });
  }
  return quests;
}

function readTalents(raw: unknown): TalentAllocation | null {
  const record = readRecord(raw);
  const alloc = record ? readRecord(record.alloc) : null;
  const ranks = alloc ? readRecord(alloc.ranks) : null;
  const choices = alloc ? readRecord(alloc.choices) : null;
  return alloc
    ? {
        spec: readString(alloc.spec),
        ranks: ranks ? Object.fromEntries(Object.entries(ranks).map(([key, value]) => [key, readNumber(value) ?? 0])) : {},
        choices: choices ? Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, readString(value) ?? ''])) : {},
      }
    : null;
}

function findNearbyCorpse(view: BotWorldView): BotEntityView | null {
  const current = view.self.targetId !== null
    ? view.entities.find((entity) => entity.id === view.self.targetId && entity.kind === 'mob' && entity.lootable && entity.dead) ?? null
    : null;
  if (current && dist2d(view.self.pos, current.pos) <= INTERACT_RANGE + 0.25) return current;
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || !entity.dead || !entity.lootable) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance > INTERACT_RANGE + 0.25 || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function findThreateningMob(view: BotWorldView): BotEntityView | null {
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || entity.dead || !entity.hostile) continue;
    if (entity.aggroTargetId !== view.self.id && view.self.targetId !== entity.id) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function currentRouteHostileTarget(
  view: BotWorldView,
  templateIds: readonly string[],
): BotEntityView | null {
  if (view.self.targetId === null) return null;
  return view.entities.find(
    (entity) =>
      entity.id === view.self.targetId
      && entity.kind === 'mob'
      && entity.hostile
      && !entity.dead
      && templateIds.includes(entity.templateId),
  ) ?? null;
}

function currentTargetObject(view: BotWorldView, objectItemId: string | null): BotEntityView | null {
  if (view.self.targetId === null || !objectItemId) return null;
  return view.entities.find(
    (entity) =>
      entity.id === view.self.targetId
      && entity.kind === 'object'
      && entity.lootable
      && entity.objectItemId === objectItemId,
  ) ?? null;
}

function nearestHostileMob(view: BotWorldView, templateId: string): BotEntityView | null {
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || entity.dead || !entity.hostile || entity.templateId !== templateId) continue;
    if (entity.level > view.self.level + 2) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance > MOB_SEARCH_RADIUS || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function nearestHostileMobByPriority(
  view: BotWorldView,
  templateIds: readonly string[],
): BotEntityView | null {
  for (const templateId of templateIds) {
    const mob = nearestHostileMob(view, templateId);
    if (mob) return mob;
  }
  return null;
}

function nearestObject(view: BotWorldView, objectItemId: string): BotEntityView | null {
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'object' || !entity.lootable || entity.objectItemId !== objectItemId) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance > MOB_SEARCH_RADIUS || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function nearestAnyHostileMob(view: BotWorldView): BotEntityView | null {
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || entity.dead || !entity.hostile) continue;
    if (entity.level > view.self.level + 1) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance > 18 || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function findNpc(view: BotWorldView, templateId: string): BotEntityView | null {
  return view.entities.find((entity) => entity.kind === 'npc' && entity.templateId === templateId) ?? null;
}

function npcFallbackPoint(templateId: string): BotPoint2d | null {
  const npc = NPCS[templateId];
  return npc ? { x: npc.pos.x, z: npc.pos.z } : null;
}

function inventoryHasJunk(inventory: readonly InvSlot[]): boolean {
  return inventory.some((slot) => ITEMS[slot.itemId]?.quality === 'poor' && slot.count > 0);
}

function countConsumables(
  inventory: readonly InvSlot[],
  kind: 'food' | 'drink',
): number {
  let total = 0;
  for (const slot of inventory) {
    const item = ITEMS[slot.itemId];
    if (!item || item.kind !== kind || slot.count <= 0) continue;
    if (kind === 'food' && item.foodHp) total += slot.count;
    if (kind === 'drink' && item.drinkMana) total += slot.count;
  }
  return total;
}

function countItemInInventory(
  inventory: readonly InvSlot[],
  itemId: string,
): number {
  let total = 0;
  for (const slot of inventory) {
    if (slot.itemId === itemId && slot.count > 0) total += slot.count;
  }
  return total;
}

function findConsumable(inventory: readonly InvSlot[], kind: 'food' | 'drink'): string | null {
  for (const slot of inventory) {
    const item = ITEMS[slot.itemId];
    if (!item || item.kind !== kind || slot.count <= 0) continue;
    if (kind === 'food' && item.foodHp) return slot.itemId;
    if (kind === 'drink' && item.drinkMana) return slot.itemId;
  }
  return null;
}

function pickCombatAbility(
  bot: AmbientPlayerBotRecord,
  self: BotSelfView,
  requireUsable: boolean,
): CombatAbility | null {
  const mods = self.talents ? computeTalentModifiers(bot.class, self.talents) : undefined;
  const abilities = abilitiesKnownAt(bot.class, self.level, mods);
  const preferRanged = !!CLASSES[bot.class].ranged;
  const candidates = abilities
    .filter(isDamageAbility)
    .filter((ability) => !ability.def.requiresStealth)
    .filter((ability) => !ability.def.requiresOutOfCombat)
    .filter((ability) => !ability.def.requiresDodgeProc)
    .filter((ability) => !ability.def.requiresTargetHpBelow)
    .filter((ability) => !ability.def.spendsCombo)
    .filter((ability) => !ability.def.targetType || ability.def.targetType !== 'friendly')
    .map((ability) => toCombatAbility(ability))
    .filter((ability): ability is CombatAbility => ability !== null)
    .filter((ability) => !requireUsable || canUseCombatAbility(ability, self));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreCombatAbility(b, preferRanged) - scoreCombatAbility(a, preferRanged));
  return candidates[0] ?? null;
}

function isDamageAbility(ability: KnownAbility): boolean {
  if (!ability.def.requiresTarget) return false;
  return ability.effects.some(
    (effect) =>
      effect.type === 'directDamage'
      || effect.type === 'weaponDamage'
      || effect.type === 'dot',
  );
}

function toCombatAbility(ability: KnownAbility): CombatAbility | null {
  return {
    id: ability.def.id,
    range: ability.def.range > 0 ? ability.def.range : MELEE_RANGE,
    minRange: ability.def.minRange ?? 0,
    castTime: ability.castTime,
    cost: ability.cost,
  };
}

function canUseCombatAbility(ability: CombatAbility, self: BotSelfView): boolean {
  if (self.gcdRemaining > 0.05) return false;
  if (self.castingAbility) return false;
  if ((self.cooldowns[ability.id] ?? 0) > 0.05) return false;
  return canAfford(ability, self);
}

function canAfford(ability: CombatAbility, self: BotSelfView): boolean {
  return self.resource >= ability.cost;
}

function abilityMatchesDistance(ability: CombatAbility, distance: number): boolean {
  return distance <= ability.range + 0.35 && distance >= ability.minRange - 0.35;
}

function desiredCombatRange(ability: CombatAbility): number {
  if (ability.range <= MELEE_RANGE + 1) return MELEE_RANGE * 0.9;
  return Math.max(ability.minRange + 0.75, Math.min(24, ability.range - 1.5));
}

function scoreCombatAbility(ability: CombatAbility, preferRanged: boolean): number {
  let score = 0;
  if (preferRanged && ability.range > MELEE_RANGE + 1) score += 100;
  if (!preferRanged && ability.range <= MELEE_RANGE + 1) score += 80;
  if (ability.castTime === 0) score += 10;
  score += ability.range;
  return score;
}

function grindRouteForSelf(self: BotSelfView): { mobId: string; camps: readonly BotPoint2d[] } {
  const zoneId = zoneAt(self.pos.z).id;
  if (zoneId === 'thornpeak_heights') {
    return self.level <= 13
      ? { mobId: 'ridge_stalker', camps: campsFor('ridge_stalker') }
      : { mobId: 'deeprock_kobold', camps: campsFor('deeprock_kobold') };
  }
  const level = self.level;
  if (level <= 2) return { mobId: 'forest_wolf', camps: campsFor('forest_wolf') };
  if (level <= 4) return { mobId: 'wild_boar', camps: campsFor('wild_boar') };
  return { mobId: 'webwood_spider', camps: campsFor('webwood_spider') };
}

function questLabel(questId: string): string {
  return QUESTS[questId]?.name ?? questId;
}

function displayMobName(mobId: string): string {
  return MOBS[mobId]?.name ?? mobId;
}

function campsFor(mobId: string): BotPoint2d[] {
  return CAMPS
    .filter((camp) => camp.mobId === mobId)
    .map((camp) => ({ x: camp.center.x, z: camp.center.z }));
}

function dungeonExitPoint(self: BotSelfView, dungeonId: string): BotPoint2d | null {
  if (self.dungeonId !== dungeonId) return null;
  const dungeon = DUNGEONS[dungeonId];
  if (!dungeon) return null;
  const origin = instanceOrigin(dungeon.index, currentInstanceSlot(self.pos.z));
  return {
    x: origin.x + dungeon.exitOffset.x,
    z: origin.z + dungeon.exitOffset.z,
  };
}

function beginObjective(
  state: AmbientPlayerBotBrainState,
  objectiveId: string,
  nowMs: number,
  pos: BotVec3,
): void {
  if (state.objectiveId === objectiveId) return;
  state.objectiveId = objectiveId;
  state.objectiveSinceMs = nowMs;
  state.lastProgressAtMs = nowMs;
  state.lastX = pos.x;
  state.lastZ = pos.z;
  state.noTargetSinceMs = null;
  clearPath(state);
}

function hasProgressed(
  state: AmbientPlayerBotBrainState,
  pos: BotVec3,
  nowMs: number,
  moving: boolean,
): boolean {
  if (state.lastX === null || state.lastZ === null) {
    state.lastX = pos.x;
    state.lastZ = pos.z;
    state.lastProgressAtMs = nowMs;
    return true;
  }
  const dx = pos.x - state.lastX;
  const dz = pos.z - state.lastZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance >= STUCK_PROGRESS_DISTANCE || !moving) {
    state.lastX = pos.x;
    state.lastZ = pos.z;
    state.lastProgressAtMs = nowMs;
    return true;
  }
  return false;
}

function clearPath(state: AmbientPlayerBotBrainState): void {
  state.pathGoalKey = null;
  state.path = [];
}

function canIssue(
  state: AmbientPlayerBotBrainState,
  key: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const last = state.lastCommandAtMs[key] ?? Number.NEGATIVE_INFINITY;
  if (nowMs - last < cooldownMs) return false;
  state.lastCommandAtMs[key] = nowMs;
  return true;
}

function moveStep(
  objectiveId: string,
  objectiveLabel: string,
  facing: number,
  commands: readonly BrainCommand[] = [],
): AmbientPlayerBotBrainTickResult {
  return {
    objectiveId,
    objectiveLabel,
    commands,
    moveInput: { f: 1 },
    facing,
  };
}

function idleStep(
  objectiveId: string,
  objectiveLabel: string,
  commands: readonly BrainCommand[] = [],
  facing?: number,
): AmbientPlayerBotBrainTickResult {
  return {
    objectiveId,
    objectiveLabel,
    commands,
    moveInput: {},
    ...(facing !== undefined ? { facing } : {}),
  };
}

function facingFor(from: BotVec3, to: BotVec3): number {
  return angleTo(from, to);
}

function pointToVec(point: BotPoint2d): BotVec3 {
  return { x: point.x, y: 0, z: point.z };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const numbers: number[] = [];
  for (const item of value) {
    const number = readNumber(item);
    if (number !== null) numbers.push(number);
  }
  return numbers;
}

function readNumberRecord(value: unknown): Record<string, number> {
  const record = readRecord(value);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const number = readNumber(raw);
    if (number !== null) out[key] = number;
  }
  return out;
}

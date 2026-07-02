import type { KnownAbility } from '../../src/sim/content/classes';
import type { TalentAllocation } from '../../src/sim/content/talents';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import { canEquipItem } from '../../src/sim/equipment_rules';
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
  type EquipSlot,
  INTERACT_RANGE,
  MELEE_RANGE,
  angleTo,
  dist2d,
  type ItemDef,
  type InvSlot,
  type PlayerClass,
  type QuestProgress,
} from '../../src/sim/types';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';
import {
  AMBIENT_BOT_SOLO_QUEST_ROUTES,
  EASTBROOK_SAFE_BOAR_CAMPS,
  EASTBROOK_SAFE_BOAR_TARGET_RADIUS,
  type AmbientBotPoint2d,
  type AmbientBotQuestRoute,
} from './progression_routes';
import { maybePrepareForPull } from './pre_combat';

const DEFAULT_WORLD_SEED = 20_061;
const PATH_NODE_REACHED_RANGE = 0.5;
const OBJECT_PICKUP_ARRIVAL_RANGE = INTERACT_RANGE;
const CAMP_ARRIVAL_RANGE = 7;
const MOB_SEARCH_RADIUS = 55;
const STUCK_PROGRESS_DISTANCE = 0.75;
const STUCK_TIMEOUT_MS = 4_000;
const NO_TARGET_ROTATE_MS = 5_000;
const COMMAND_COOLDOWN_MS = 900;
const QUEST_INTAKE_NEARBY_RANGE = 18;
const PARTY_ROUTE_NEARBY_RANGE = 48;
const COLLECT_RESUPPLY_DEFER_RANGE = PARTY_ROUTE_NEARBY_RANGE + CAMP_ARRIVAL_RANGE;
const PARTY_ROUTE_MAX_LEVEL_BONUS = 1;
const PARTY_ROUTE_FULL_GROUP_LEVEL_BONUS = 1;
const RECOVERY_HP_THRESHOLD = 0.7;
const RECOVERY_MANA_THRESHOLD = 0.45;
const FOOD_RESTOCK_TRIGGER_COUNT = 2;
const FOOD_RESTOCK_TARGET_COUNT = 4;
const DRINK_RESTOCK_TRIGGER_COUNT = 2;
const DRINK_RESTOCK_TARGET_COUNT = 4;
const HEALING_POTION_HP_THRESHOLD = 0.38;
const HEALING_POTION_RESTOCK_TRIGGER_COUNT = 2;
const HEALING_POTION_RESTOCK_TARGET_COUNT = 3;
const DANGEROUS_PULL_THREAT_COUNT = 3;
const DANGEROUS_PULL_LOW_HP_THREAT_COUNT = 2;
const DANGEROUS_PULL_LOW_HP_THRESHOLD = 0.58;
const DANGEROUS_PULL_EMERGENCY_HP_THRESHOLD = 0.45;
const DANGEROUS_PULL_POTION_HP_THRESHOLD = 0.68;
const DANGEROUS_PULL_SAFE_ARRIVAL_RANGE = INTERACT_RANGE + 4;
const DANGEROUS_PULL_MIN_LEVEL = 4;
const DANGEROUS_PULL_WEBWOOD_MIN_LEVEL = 3;
const SELF_MAINTENANCE_OBJECTIVES = ['recover', 'prepare_combat', 'equip_upgrade', 'sell_junk'] as const;

interface AmbientBotVendorProfile {
  vendorNpcTemplateId: string;
  foodItemId: string;
  drinkItemId: string;
  healingPotionItemId: string;
}

const EASTBROOK_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'trader_wilkes',
  foodItemId: 'baked_bread',
  drinkItemId: 'spring_water',
  healingPotionItemId: 'minor_healing_potion',
};

const FENBRIDGE_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'provisioner_hale',
  foodItemId: 'fenbridge_rye',
  drinkItemId: 'marsh_mint_tea',
  healingPotionItemId: 'lesser_healing_potion',
};

const HIGHWATCH_VENDOR_PROFILE: AmbientBotVendorProfile = {
  vendorNpcTemplateId: 'quartermaster_bree',
  foodItemId: 'trail_hardtack',
  drinkItemId: 'meltwater_flask',
  healingPotionItemId: 'healing_potion',
};

const EASTBROOK_GEAR_VENDOR_NPC_TEMPLATE_ID = 'smith_haldren';
const EASTBROOK_WEAPON_UPGRADE_IDS = [
  'eastbrook_arming_sword',
  'bronzework_mace',
  'vale_carving_knife',
  'hickory_shortstaff',
] as const;

const EASTBROOK_WEBWOOD_PARTY_GRIND_CAMPS: readonly BotPoint2d[] = [
  { x: -43, z: -2 },
  { x: -52, z: -6 },
];
const EASTBROOK_WEBWOOD_PARTY_GRIND_TARGET_RADIUS = 18;

type BrainCommand = Record<string, unknown>;
type MoveInputPayload = Record<string, 1>;

type BotPoint2d = AmbientBotPoint2d;

const EASTBROOK_VENDOR_WEST_APPROACH_POINT: BotPoint2d = { x: -10, z: -2 };
const EASTBROOK_VENDOR_WEST_APPROACH_ARRIVAL_RANGE = 1.5;
const EASTBROOK_VENDOR_WEST_APPROACH_START_X = -12;
const EASTBROOK_VENDOR_WEST_APPROACH_MIN_Z = -4;
const EASTBROOK_VENDOR_WEST_APPROACH_MAX_Z = 70;

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
  tappedById: number | null;
  ownerId: number | null;
  corpseLoot: BotCorpseLoot | null;
}

interface BotLootSlot extends InvSlot {
  personalFor?: readonly number[];
  openToAll?: boolean;
}

interface BotCorpseLoot {
  copper: number;
  items: readonly BotLootSlot[];
}

interface BotAuraView {
  id: string;
  kind: string;
  remaining: number;
  duration: number;
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
  auras: BotAuraView[];
  inventory: InvSlot[];
  equipment: Partial<Record<EquipSlot, string>>;
  partyMemberIds: ReadonlySet<number>;
  partyMembers: readonly BotPartyQuestMemberView[];
  questLog: Map<string, QuestProgress>;
  questsDone: Set<string>;
  talents: TalentAllocation | null;
}

interface BotPartyQuestMemberView {
  id: number;
  dead: boolean;
  questLog: Map<string, QuestProgress>;
  questsDone: Set<string>;
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
  targetCampRadius?: number;
  npcTemplateId?: string;
  allowAnyHostileFallback?: boolean;
  vendorPurchases?: readonly AmbientBotVendorPurchase[];
  vendorSales?: readonly AmbientBotVendorSale[];
  dungeonId?: string;
  suggestedPartySize?: number;
  leaveDungeon?: boolean;
}

interface AmbientBotVendorPurchase {
  itemId: string;
  targetCount: number;
}

interface AmbientBotVendorSale {
  itemId: string;
  count: number;
}

interface AmbientBotWeaponPurchasePlan {
  itemId: string;
  vendorSales: readonly AmbientBotVendorSale[];
}

export interface AmbientPlayerBotTravelGoal {
  target: AmbientBotPoint2d;
  arrivalRange: number;
  goalKey: string;
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
  travelGoal?: AmbientPlayerBotTravelGoal;
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
  const objective = chooseObjective(view, input.bot);
  beginObjective(state, objective.id, input.nowMs, self.pos);

  if (objective.id === 'release') {
    const commands: BrainCommand[] = [];
    if (canIssue(state, 'release', input.nowMs, 3_000)) commands.push({ cmd: 'release' });
    return finalizeStep(state, input, view, objective, idleStep(objective.id, objective.label, commands));
  }

  const gearUpgrade = maybeEquipUpgrade(view, input.bot, state, input.nowMs);
  if (gearUpgrade) {
    beginObjective(state, 'equip_upgrade', input.nowMs, self.pos);
    return finalizeStep(
      state,
      input,
      view,
      { id: 'equip_upgrade', label: 'Equipping gear upgrade' },
      gearUpgrade,
    );
  }

  const nearbyObject = collectObjectAtHand(view, state, input, objective);
  if (nearbyObject) return finalizeStep(state, input, view, objective, nearbyObject);

  const threat = findThreateningMob(view);
  const dangerousPull = maybeRetreatFromDangerousPull(view, state, input);
  if (dangerousPull) {
    beginObjective(state, 'retreat', input.nowMs, self.pos);
    return finalizeStep(
      state,
      input,
      view,
      objective,
      dangerousPull,
    );
  }

  const recovery = maybeRecover(view, state, input.nowMs, threat !== null);
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

  if (threat) {
    const threatStep = fightTarget(
      view,
      input.bot,
      threat,
      state,
      input.liveState.seed ?? DEFAULT_WORLD_SEED,
      input.nowMs,
      objective.label,
    );
    return finalizeStep(state, input, view, objective, threatStep);
  }

  const loot = maybeLootNearby(view, state, input.nowMs);
  if (loot) return finalizeStep(state, input, view, objective, loot);

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
  if (objective.camps?.length) {
    return finalizeStep(
      state,
      input,
      view,
      objective,
      patrolObjectiveCamps(view, state, input, objective),
    );
  }
  return finalizeStep(state, input, view, objective, idleStep(objective.id, objective.label));
}

function chooseObjective(view: BotWorldView, bot: AmbientPlayerBotRecord): AmbientBotObjective {
  if (view.self.hp <= 0) return { id: 'release', label: 'Releasing spirit' };

  const questObjective = chooseQuestObjective(view);
  const resupplyObjective = chooseResupplyObjective(view, questObjective);
  if (resupplyObjective) return resupplyObjective;
  const gearPurchaseObjective = questObjective?.id.startsWith('turnin_')
    ? null
    : chooseGearPurchaseObjective(view, bot);
  if (gearPurchaseObjective) return gearPurchaseObjective;
  const deferredQuestRoute = deferredActiveQuestRoute(view);
  if (questObjective) return questObjective;
  if (deferredQuestRoute) return grindObjectiveForView(view);

  if (inventoryHasJunk(view.self.inventory)) {
    const vendorProfile = vendorProfileFor(view.self);
    return {
      id: 'sell_junk',
      label: 'Vendoring poor-quality loot',
      npcTemplateId: vendorProfile.vendorNpcTemplateId,
    };
  }

  return grindObjectiveForView(view);
}

function grindObjectiveForView(view: BotWorldView): AmbientBotObjective {
  const grind = grindRouteForView(view);
  return {
    id: 'grind',
    label: `Grinding ${displayMobName(grind.mobId)}`,
    mobId: grind.mobId,
    camps: grind.camps,
    ...(grind.targetCampRadius !== undefined ? { targetCampRadius: grind.targetCampRadius } : {}),
    allowAnyHostileFallback: true,
  };
}

function chooseResupplyObjective(
  view: BotWorldView,
  questObjective: AmbientBotObjective | null,
): AmbientBotObjective | null {
  if (questObjective?.npcTemplateId) return null;
  if (questObjective && shouldFinishNearbyCollectObjectiveBeforeResupply(view, questObjective)) return null;
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

function shouldFinishNearbyCollectObjectiveBeforeResupply(
  view: BotWorldView,
  objective: AmbientBotObjective,
): boolean {
  if (!objective.objectItemId) return false;
  const visibleObject = nearestObject(view, objective.objectItemId);
  if (visibleObject) return true;
  const camps = objective.camps ?? [];
  return camps.some((camp) => dist2d(view.self.pos, pointToVec(camp)) <= COLLECT_RESUPPLY_DEFER_RANGE);
}

function chooseGearPurchaseObjective(
  view: BotWorldView,
  bot: AmbientPlayerBotRecord,
): AmbientBotObjective | null {
  const plan = bestAffordableVendorWeaponPlan(bot.class, view.self);
  if (!plan) return null;
  return {
    id: `buy_${plan.itemId}`,
    label: `Buying ${ITEMS[plan.itemId]?.name ?? plan.itemId}`,
    npcTemplateId: EASTBROOK_GEAR_VENDOR_NPC_TEMPLATE_ID,
    vendorPurchases: [{ itemId: plan.itemId, targetCount: 1 }],
    ...(plan.vendorSales.length > 0 ? { vendorSales: plan.vendorSales } : {}),
  };
}

function chooseQuestObjective(view: BotWorldView): AmbientBotObjective | null {
  const readyRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteReady(route, view));
  if (readyRoute) {
    return readyQuestObjectiveForRoute(view, readyRoute);
  }

  const nearbyAvailableRoute = nearbyAvailableQuestRoute(view);
  if (nearbyAvailableRoute) return acceptQuestObjective(nearbyAvailableRoute);

  const activeCollectRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find(
    (route) => route.kind === 'collect' && isQuestRouteActive(route, view),
  );
  if (activeCollectRoute) return activeQuestObjectiveForRoute(view, activeCollectRoute);

  const partyBackfillRoute = partyBackfillQuestRoute(view);
  if (partyBackfillRoute) {
    return partyBackfillRoute.progress.state === 'ready'
      ? readyQuestObjectiveForRoute(view, partyBackfillRoute.route)
      : partyBackfillObjectiveForRoute(view, partyBackfillRoute.route);
  }

  const activeRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteActive(route, view));
  if (activeRoute) {
    return activeQuestObjectiveForRoute(view, activeRoute);
  }

  const availableRoute = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => isQuestRouteAvailable(route, view));
  if (!availableRoute) return null;
  return acceptQuestObjective(availableRoute);
}

function readyQuestObjectiveForRoute(
  view: BotWorldView,
  route: AmbientBotQuestRoute,
): AmbientBotObjective {
  if (route.dungeonId && view.self.dungeonId === route.dungeonId) {
    return dungeonExitObjective(route);
  }
  return {
    id: route.turnInObjectiveId,
    label: route.turnInLabel,
    questId: route.questId,
    npcTemplateId: route.turnInNpcTemplateId,
  };
}

function activeQuestObjectiveForRoute(
  view: BotWorldView,
  route: AmbientBotQuestRoute,
): AmbientBotObjective {
  if (route.dungeonId && view.self.dungeonId !== route.dungeonId) {
    return dungeonEntryObjective(route);
  }
  const activeCamps = route.dungeonId
    ? resolveDungeonRouteCamps(view.self, route)
    : route.camps;
  return {
    id: route.activeObjectiveId,
    label: route.activeLabel,
    questId: route.questId,
    camps: activeCamps,
    ...(route.targetCampRadius !== undefined ? { targetCampRadius: route.targetCampRadius } : {}),
    ...(route.dungeonId ? { dungeonId: route.dungeonId } : {}),
    ...(route.suggestedPartySize
      ? { suggestedPartySize: route.suggestedPartySize }
      : {}),
    ...(route.kind === 'kill'
      ? {
          mobId: route.mobId,
          ...(route.alternateMobIds ? { alternateMobIds: route.alternateMobIds } : {}),
          allowAnyHostileFallback: route.allowAnyHostileFallback ?? false,
        }
      : {
          objectItemId: route.objectItemId,
        }),
  };
}

function partyBackfillObjectiveForRoute(
  view: BotWorldView,
  route: AmbientBotQuestRoute,
): AmbientBotObjective {
  if (route.kind === 'collect') {
    const selfProgress = view.self.questLog.get(route.questId);
    if (selfProgress?.state === 'active' && routeObjectiveNeedsWork(route, selfProgress)) {
      return activeQuestObjectiveForRoute(view, route);
    }
    return escortQuestObjectiveForRoute(view, route);
  }
  return activeQuestObjectiveForRoute(view, route);
}

function escortQuestObjectiveForRoute(
  view: BotWorldView,
  route: AmbientBotQuestRoute,
): AmbientBotObjective {
  if (route.dungeonId && view.self.dungeonId !== route.dungeonId) {
    return dungeonEntryObjective(route);
  }
  const activeCamps = route.dungeonId
    ? resolveDungeonRouteCamps(view.self, route)
    : route.camps;
  return {
    id: `assist_${route.activeObjectiveId}`,
    label: route.activeLabel,
    questId: route.questId,
    camps: activeCamps,
    ...(route.dungeonId ? { dungeonId: route.dungeonId } : {}),
    ...(route.suggestedPartySize
      ? { suggestedPartySize: route.suggestedPartySize }
      : {}),
  };
}

function acceptQuestObjective(route: AmbientBotQuestRoute): AmbientBotObjective {
  return {
    id: route.acceptObjectiveId,
    label: route.acceptLabel,
    questId: route.questId,
    npcTemplateId: route.giverNpcTemplateId,
  };
}

function partyBackfillQuestRoute(
  view: BotWorldView,
): { route: AmbientBotQuestRoute; progress: QuestProgress } | null {
  const partyMembers = view.self.partyMembers.filter((member) =>
    member.id !== view.self.id && !member.dead);
  if (partyMembers.length === 0) return null;
  for (const route of AMBIENT_BOT_SOLO_QUEST_ROUTES) {
    if (view.self.level < effectiveRoutePursueLevel(route, view)) continue;
    for (const member of partyMembers) {
      if (member.questsDone.has(route.questId)) continue;
      const progress = member.questLog.get(route.questId);
      if (!progress || progress.state === 'done') continue;
      if (progress.state === 'ready') return { route, progress };
      if (progress.state === 'active' && routeObjectiveNeedsWork(route, progress)) {
        return { route, progress };
      }
    }
  }
  return null;
}

function deferredActiveQuestRoute(view: BotWorldView): AmbientBotQuestRoute | null {
  return AMBIENT_BOT_SOLO_QUEST_ROUTES.find((route) => {
    const progress = view.self.questLog.get(route.questId);
    if (!progress || progress.state !== 'active') return false;
    if (view.self.level >= effectiveRoutePursueLevel(route, view)) return false;
    return routeObjectiveNeedsWork(route, progress);
  }) ?? null;
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
  if (view.self.level < effectiveRoutePursueLevel(route, view)) return false;
  if (route.acceptBeforeActiveQuestIds?.some((questId) => isStandaloneQuestAvailable(questId, view))) {
    return false;
  }
  return routeObjectiveNeedsWork(route, progress);
}

function isQuestRouteAvailable(
  route: AmbientBotQuestRoute,
  view: BotWorldView,
): boolean {
  return isQuestRouteAcceptable(route, view)
    && view.self.level >= distantQuestPickupLevel(route);
}

function distantQuestPickupLevel(route: AmbientBotQuestRoute): number {
  return route.pursueAtLevel;
}

function isQuestRouteAcceptable(
  route: AmbientBotQuestRoute,
  view: BotWorldView,
): boolean {
  const progress = view.self.questLog.get(route.questId);
  if (view.self.questsDone.has(route.questId) || progress) return false;
  const quest = QUESTS[route.questId];
  if (!quest) return false;
  if (view.self.level < (quest.minLevel ?? 1)) return false;
  if (quest.requiresQuest && !view.self.questsDone.has(quest.requiresQuest)) return false;
  return true;
}

function nearbyAvailableQuestRoute(view: BotWorldView): AmbientBotQuestRoute | null {
  const vendorPurchases = buildVendorPurchases(view.self, vendorProfileFor(view.self));
  let best: { route: AmbientBotQuestRoute; distance: number; index: number } | null = null;
  for (let index = 0; index < AMBIENT_BOT_SOLO_QUEST_ROUTES.length; index++) {
    const route = AMBIENT_BOT_SOLO_QUEST_ROUTES[index];
    if (!route || !isQuestRouteAcceptable(route, view)) continue;
    if (
      vendorPurchases.length > 0
      && !nearbyQuestIntakeCanPreemptResupply(view, route)
    ) {
      continue;
    }
    const distance = visibleQuestGiverDistance(view, route);
    if (distance === null || distance > QUEST_INTAKE_NEARBY_RANGE) continue;
    if (!best || distance < best.distance || (distance === best.distance && index < best.index)) {
      best = { route, distance, index };
    }
  }
  return best?.route ?? null;
}

function nearbyQuestIntakeCanPreemptResupply(
  view: BotWorldView,
  route: AmbientBotQuestRoute,
): boolean {
  const zoneId = zoneAt(view.self.pos.z).id;
  if (zoneId === 'eastbrook_vale') return false;
  return view.self.level >= Math.max(1, route.pursueAtLevel - PARTY_ROUTE_MAX_LEVEL_BONUS);
}

function visibleQuestGiverDistance(view: BotWorldView, route: AmbientBotQuestRoute): number | null {
  const npc = findNpc(view, route.giverNpcTemplateId);
  return npc ? dist2d(view.self.pos, npc.pos) : null;
}

function effectiveRoutePursueLevel(route: AmbientBotQuestRoute, view: BotWorldView): number {
  return Math.max(1, route.pursueAtLevel - partyRouteLevelBonus(route, view));
}

function partyRouteLevelBonus(route: AmbientBotQuestRoute, view: BotWorldView): number {
  if (route.allowPartyLevelBonus === false) return 0;
  const nearbyPartyLevels = nearbyContributingPartyLevels(view);
  const maxBonus = nearbyPartyLevels.length >= 5
    ? PARTY_ROUTE_FULL_GROUP_LEVEL_BONUS
    : PARTY_ROUTE_MAX_LEVEL_BONUS;
  const bonus = Math.min(maxBonus, Math.max(0, nearbyPartyLevels.length - 1));
  if (bonus <= 0) return 0;
  const effectiveLevel = Math.max(1, route.pursueAtLevel - bonus);
  return Math.min(...nearbyPartyLevels) >= effectiveLevel ? bonus : 0;
}

function nearbyContributingPartyLevels(view: BotWorldView): number[] {
  const levels = [view.self.level];
  const seen = new Set<number>([view.self.id]);
  for (const entity of view.entities) {
    if (seen.has(entity.id)) continue;
    if (entity.kind !== 'player' || entity.dead) continue;
    if (entity.id !== view.self.id && !view.self.partyMemberIds.has(entity.id)) continue;
    if (dist2d(view.self.pos, entity.pos) > PARTY_ROUTE_NEARBY_RANGE) continue;
    seen.add(entity.id);
    levels.push(entity.level);
  }
  return levels;
}

function routeObjectiveNeedsWork(
  route: AmbientBotQuestRoute,
  progress: QuestProgress,
): boolean {
  const objectiveIndex = questObjectiveIndexForRoute(route);
  if (objectiveIndex === null) return true;
  const objective = QUESTS[route.questId]?.objectives[objectiveIndex];
  if (!objective) return true;
  return (progress.counts[objectiveIndex] ?? 0) < objective.count;
}

function questObjectiveIndexForRoute(route: AmbientBotQuestRoute): number | null {
  if (route.questObjectiveIndex !== undefined) return route.questObjectiveIndex;
  const quest = QUESTS[route.questId];
  if (!quest) return null;
  if (route.kind === 'collect') {
    const objectiveIndex = quest.objectives.findIndex(
      (objective) => objective.type === 'collect' && objective.itemId === route.objectItemId,
    );
    return objectiveIndex >= 0 ? objectiveIndex : null;
  }
  const mobIds = new Set([route.mobId, ...(route.alternateMobIds ?? [])]);
  const objectiveIndex = quest.objectives.findIndex(
    (objective) => objective.type === 'kill' && mobIds.has(objective.targetMobId),
  );
  return objectiveIndex >= 0 ? objectiveIndex : null;
}

function isStandaloneQuestAvailable(
  questId: string,
  view: BotWorldView,
): boolean {
  const route = AMBIENT_BOT_SOLO_QUEST_ROUTES.find((candidate) => candidate.questId === questId);
  return route ? isQuestRouteAcceptable(route, view) : false;
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
  const shouldRestockFood =
    countConsumables(self.inventory, 'food') < FOOD_RESTOCK_TRIGGER_COUNT
    && canAffordVendorItem(self.copper, vendorProfile.foodItemId, canSellJunk);
  if (shouldRestockFood) {
    purchases.push({ itemId: vendorProfile.foodItemId, targetCount: FOOD_RESTOCK_TARGET_COUNT });
  }
  const shouldRestockDrink =
    self.resourceType === 'mana'
    && countConsumables(self.inventory, 'drink') < DRINK_RESTOCK_TRIGGER_COUNT
    && canAffordVendorItem(self.copper, vendorProfile.drinkItemId, canSellJunk);
  if (shouldRestockDrink) {
    purchases.push({ itemId: vendorProfile.drinkItemId, targetCount: DRINK_RESTOCK_TARGET_COUNT });
  }
  if (
    countHealingPotions(self.inventory) < HEALING_POTION_RESTOCK_TRIGGER_COUNT
    && canAffordVendorItem(self.copper, vendorProfile.healingPotionItemId, canSellJunk)
  ) {
    purchases.push({
      itemId: vendorProfile.healingPotionItemId,
      targetCount: HEALING_POTION_RESTOCK_TARGET_COUNT,
    });
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
  immediateThreat: boolean,
): AmbientPlayerBotBrainTickResult | null {
  const commands: BrainCommand[] = [];
  const hpRatio = view.self.maxHp > 0 ? view.self.hp / view.self.maxHp : 1;
  if (view.self.eatingRemaining !== null || view.self.drinkingRemaining !== null) {
    return idleStep('recover', 'Recovering between pulls');
  }
  if (hpRatio < HEALING_POTION_HP_THRESHOLD) {
    const potion = findHealingPotion(view.self.inventory);
    if (potion && canIssue(state, `use:${potion}`, nowMs, 3_000)) {
      commands.push({ cmd: 'use', item: potion });
    }
    if (commands.length > 0 && immediateThreat) {
      return idleStep('recover', 'Recovering between pulls', commands);
    }
  }
  if (hpRatio < RECOVERY_HP_THRESHOLD) {
    const food = findConsumable(view.self.inventory, 'food');
    if (!immediateThreat && food && canIssue(state, `use:${food}`, nowMs, 3_000)) {
      commands.push({ cmd: 'use', item: food });
    }
    if (!immediateThreat) return idleStep('recover', 'Recovering between pulls', commands);
  }
  if (view.self.resourceType === 'mana' && view.self.maxResource > 0) {
    const manaRatio = view.self.resource / view.self.maxResource;
    if (manaRatio < RECOVERY_MANA_THRESHOLD) {
      const drink = findConsumable(view.self.inventory, 'drink');
      if (!immediateThreat && drink && canIssue(state, `use:${drink}`, nowMs, 3_000)) {
        commands.push({ cmd: 'use', item: drink });
      }
      if (!immediateThreat) return idleStep('recover', 'Recovering between pulls', commands);
    }
  }
  return commands.length > 0 ? idleStep('recover', 'Recovering between pulls', commands) : null;
}

function maybeRetreatFromDangerousPull(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
): AmbientPlayerBotBrainTickResult | null {
  const threats = threateningMobs(view);
  if (threats.length === 0) return null;
  const minLevel = threats.some((threat) => threat.templateId === 'webwood_spider')
    ? DANGEROUS_PULL_WEBWOOD_MIN_LEVEL
    : DANGEROUS_PULL_MIN_LEVEL;
  if (view.self.level < minLevel) return null;

  const hpRatio = view.self.maxHp > 0 ? view.self.hp / view.self.maxHp : 1;
  const dangerousByCount = threats.length >= DANGEROUS_PULL_THREAT_COUNT;
  const dangerousByLowHp =
    threats.length >= DANGEROUS_PULL_LOW_HP_THREAT_COUNT
    && hpRatio < DANGEROUS_PULL_LOW_HP_THRESHOLD;
  const dangerousByEmergencyHp = hpRatio < DANGEROUS_PULL_EMERGENCY_HP_THRESHOLD;
  if (!dangerousByCount && !dangerousByLowHp && !dangerousByEmergencyHp) return null;

  const commands: BrainCommand[] = [];
  if (hpRatio < DANGEROUS_PULL_POTION_HP_THRESHOLD) {
    const potion = findHealingPotion(view.self.inventory);
    if (potion && canIssue(state, `use:${potion}`, input.nowMs, 3_000)) {
      commands.push({ cmd: 'use', item: potion });
    }
  }
  if (view.self.autoAttack && canIssue(state, 'stopattack', input.nowMs, 1_500)) {
    commands.push({ cmd: 'stopattack' });
  }
  if (view.self.targetId !== null && canIssue(state, 'clear_target', input.nowMs, 1_500)) {
    commands.push({ cmd: 'target', id: null });
  }

  const vendorTemplateId = vendorProfileFor(view.self).vendorNpcTemplateId;
  const safePoint = npcFallbackPoint(vendorTemplateId) ?? { x: 0, z: 0 };
  return travelToPoint(
    view,
    state,
    input.liveState.seed ?? DEFAULT_WORLD_SEED,
    { id: 'recover', label: 'Retreating from a dangerous pull' },
    safePoint,
    DANGEROUS_PULL_SAFE_ARRIVAL_RANGE,
    `retreat:${vendorTemplateId}`,
    commands,
  );
}

function maybeEquipUpgrade(
  view: BotWorldView,
  bot: AmbientPlayerBotRecord,
  state: AmbientPlayerBotBrainState,
  nowMs: number,
): AmbientPlayerBotBrainTickResult | null {
  const itemId = bestEquipmentUpgrade(bot.class, view.self);
  if (!itemId || !canIssue(state, `equip:${itemId}`, nowMs, COMMAND_COOLDOWN_MS)) return null;
  return idleStep('equip_upgrade', 'Equipping gear upgrade', [{ cmd: 'equip', item: itemId }]);
}

function bestEquipmentUpgrade(cls: PlayerClass, self: BotSelfView): string | null {
  let bestItemId: string | null = null;
  let bestDelta = 0;
  for (const slot of self.inventory) {
    const item = ITEMS[slot.itemId];
    if (!item?.slot || (item.kind !== 'weapon' && item.kind !== 'armor')) continue;
    if (!canEquipItem(cls, item)) continue;
    const current = self.equipment[item.slot] ? ITEMS[self.equipment[item.slot]!] : null;
    const delta = equipmentScore(item) - equipmentScore(current);
    if (delta > bestDelta + 0.1) {
      bestDelta = delta;
      bestItemId = item.id;
    }
  }
  return bestItemId;
}

function bestAffordableVendorWeapon(cls: PlayerClass, self: BotSelfView): string | null {
  return bestAffordableVendorWeaponPlan(cls, self)?.itemId ?? null;
}

function bestAffordableVendorWeaponPlan(
  cls: PlayerClass,
  self: BotSelfView,
): AmbientBotWeaponPurchasePlan | null {
  const current = self.equipment.mainhand ? ITEMS[self.equipment.mainhand] : null;
  const junkValue = sellAllJunkValue(self.inventory);
  const saleCandidates = vendorSaleCandidatesForGearPurchase(cls, self);
  let bestItemId: string | null = null;
  let bestDelta = 0;
  let bestVendorSales: readonly AmbientBotVendorSale[] = [];
  for (const itemId of EASTBROOK_WEAPON_UPGRADE_IDS) {
    if (countItemInInventory(self.inventory, itemId) > 0) continue;
    const item = ITEMS[itemId];
    if (!item?.buyValue) continue;
    if (!canEquipItem(cls, item)) continue;
    const delta = equipmentScore(item) - equipmentScore(current);
    const remainingAfterJunk = item.buyValue - self.copper - junkValue;
    const vendorSales = remainingAfterJunk > 0
      ? vendorSalesForNeed(saleCandidates, remainingAfterJunk)
      : [];
    const totalFunds = self.copper + junkValue + vendorSaleTotal(vendorSales);
    if (totalFunds < item.buyValue) continue;
    if (delta > bestDelta + 0.1) {
      bestDelta = delta;
      bestItemId = item.id;
      bestVendorSales = vendorSales;
    }
  }
  return bestItemId ? { itemId: bestItemId, vendorSales: bestVendorSales } : null;
}

function sellAllJunkValue(inventory: readonly InvSlot[]): number {
  let total = 0;
  for (const slot of inventory) {
    const item = ITEMS[slot.itemId];
    if (!item || item.quality !== 'poor' || item.kind === 'quest' || item.noVendorSell || slot.count <= 0) continue;
    total += item.sellValue * slot.count;
  }
  return total;
}

function vendorSaleCandidatesForGearPurchase(
  cls: PlayerClass,
  self: BotSelfView,
): AmbientBotVendorSale[] {
  const sales: AmbientBotVendorSale[] = [];
  for (const slot of self.inventory) {
    if (slot.count <= 0) continue;
    const item = ITEMS[slot.itemId];
    if (!item || item.sellValue <= 0 || item.kind === 'quest' || item.noVendorSell) continue;
    if (item.kind === 'food' || item.kind === 'drink' || item.kind === 'potion' || item.kind === 'elixir') continue;
    if (item.quality === 'poor' && item.kind === 'junk') continue;
    if (item.kind === 'armor' || item.kind === 'weapon') {
      if (!item.slot) continue;
      if (canEquipItem(cls, item)) {
        const current = self.equipment[item.slot] ? ITEMS[self.equipment[item.slot]!] : null;
        if (equipmentScore(item) > equipmentScore(current) + 0.1) continue;
      }
    } else if (item.kind !== 'junk') {
      continue;
    }
    sales.push({ itemId: slot.itemId, count: slot.count });
  }
  return sales;
}

function vendorSalesForNeed(
  candidates: readonly AmbientBotVendorSale[],
  copperNeeded: number,
): AmbientBotVendorSale[] {
  const sales: AmbientBotVendorSale[] = [];
  let remaining = copperNeeded;
  for (const candidate of candidates) {
    const item = ITEMS[candidate.itemId];
    if (!item || item.sellValue <= 0) continue;
    const count = Math.min(candidate.count, Math.ceil(remaining / item.sellValue));
    if (count <= 0) continue;
    sales.push({ itemId: candidate.itemId, count });
    remaining -= item.sellValue * count;
    if (remaining <= 0) break;
  }
  return remaining <= 0 ? sales : [];
}

function vendorSaleTotal(sales: readonly AmbientBotVendorSale[]): number {
  let total = 0;
  for (const sale of sales) {
    const item = ITEMS[sale.itemId];
    if (!item) continue;
    total += item.sellValue * sale.count;
  }
  return total;
}

function equipmentScore(item: ItemDef | null | undefined): number {
  if (!item) return 0;
  const stats = item.stats;
  const statScore =
    (stats?.armor ?? 0)
    + (stats?.sta ?? 0) * 8
    + (stats?.str ?? 0) * 4
    + (stats?.agi ?? 0) * 3
    + (stats?.int ?? 0) * 3
    + (stats?.spi ?? 0) * 2;
  if (item.kind !== 'weapon' || !item.weapon) return statScore;
  return statScore + ((item.weapon.min + item.weapon.max) / Math.max(0.1, item.weapon.speed)) * 6;
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
    return travelToPoint(
      view,
      state,
      input.liveState.seed ?? DEFAULT_WORLD_SEED,
      objective,
      target,
      INTERACT_RANGE + 1.5,
      `npc:${objective.npcTemplateId}`,
    );
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
  const arrivalRange = INTERACT_RANGE + 1.5;
  if (dist2d(view.self.pos, pointToVec(target)) > arrivalRange) {
    const approach = vendorApproachPoint(objective.npcTemplateId, view.self.pos);
    if (
      approach
      && dist2d(view.self.pos, pointToVec(approach)) > EASTBROOK_VENDOR_WEST_APPROACH_ARRIVAL_RANGE
    ) {
      return travelToPoint(
        view,
        state,
        input.liveState.seed ?? DEFAULT_WORLD_SEED,
        objective,
        approach,
        EASTBROOK_VENDOR_WEST_APPROACH_ARRIVAL_RANGE,
        `vendor-approach:${objective.npcTemplateId}`,
      );
    }
    return travelToPoint(
      view,
      state,
      input.liveState.seed ?? DEFAULT_WORLD_SEED,
      objective,
      target,
      arrivalRange,
      `vendor:${objective.npcTemplateId}`,
    );
  }
  const commands: BrainCommand[] = [];
  if (npc && view.self.targetId !== npc.id && canIssue(state, `target:${npc.id}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: npc.id });
  }
  if (inventoryHasJunk(view.self.inventory) && canIssue(state, 'sell_all_junk', input.nowMs, 5_000)) {
    commands.push({ cmd: 'sell_all_junk' });
  } else if (objective.vendorSales && objective.vendorSales.length > 0) {
    const sale = nextVendorSale(objective.vendorSales, view.self.inventory);
    if (sale && canIssue(state, `sell:${sale.itemId}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
      commands.push({ cmd: 'sell', item: sale.itemId, count: sale.count });
    }
  } else if (npc && objective.vendorPurchases) {
    const purchase = nextVendorPurchase(objective.vendorPurchases, view.self.inventory);
    if (purchase && canIssue(state, `buy:${purchase.itemId}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
      commands.push({ cmd: 'buy', npc: npc.id, item: purchase.itemId });
    }
  }
  return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, pointToVec(target)));
}

function vendorApproachPoint(
  npcTemplateId: string | undefined,
  selfPos: BotVec3,
): BotPoint2d | null {
  if (npcTemplateId !== EASTBROOK_VENDOR_PROFILE.vendorNpcTemplateId) return null;
  if (selfPos.x > EASTBROOK_VENDOR_WEST_APPROACH_START_X) return null;
  if (
    selfPos.z < EASTBROOK_VENDOR_WEST_APPROACH_MIN_Z
    || selfPos.z > EASTBROOK_VENDOR_WEST_APPROACH_MAX_Z
  ) {
    return null;
  }
  return EASTBROOK_VENDOR_WEST_APPROACH_POINT;
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
        input.liveState.seed ?? DEFAULT_WORLD_SEED,
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
      input.liveState.seed ?? DEFAULT_WORLD_SEED,
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

function nextVendorSale(
  sales: readonly AmbientBotVendorSale[],
  inventory: readonly InvSlot[],
): AmbientBotVendorSale | null {
  for (const sale of sales) {
    const available = countItemInInventory(inventory, sale.itemId);
    if (available <= 0) continue;
    return { itemId: sale.itemId, count: Math.min(sale.count, available) };
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
  const currentTarget = currentRouteHostileTarget(
    view,
    preferredMobIds,
    objective.camps,
    objective.targetCampRadius,
  );
  const target =
    currentTarget
    ?? nearestHostileMobByPriority(view, preferredMobIds, objective.camps, objective.targetCampRadius)
    ?? (objective.allowAnyHostileFallback ? nearestAnyHostileMob(view) : null);
  if (target) {
    state.noTargetSinceMs = null;
    const preparation = maybePrepareForPull({
      bot: input.bot,
      self: view.self,
      entities: view.entities,
      issueCommand: (key, cooldownMs) => canIssue(state, key, input.nowMs, cooldownMs),
    });
    if (preparation) {
      return idleStep(
        preparation.objectiveId,
        preparation.objectiveLabel,
        preparation.commands,
        facingFor(view.self.pos, target.pos),
      );
    }
    return fightTarget(
      view,
      input.bot,
      target,
      state,
      input.liveState.seed ?? DEFAULT_WORLD_SEED,
      input.nowMs,
      objective.label,
    );
  }

  return patrolObjectiveCamps(view, state, input, objective);
}

function patrolObjectiveCamps(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult {
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
    input.liveState.seed ?? DEFAULT_WORLD_SEED,
    objective,
    activeCamp,
    CAMP_ARRIVAL_RANGE,
    `camp:${objective.mobId ?? objective.objectItemId ?? objective.id}:${state.campIndex % camps.length}`,
  );
}

function collectObjectAtHand(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  input: AmbientPlayerBotBrainTickInput,
  objective: AmbientBotObjective,
): AmbientPlayerBotBrainTickResult | null {
  const preferredItemId = objective.objectItemId;
  if (!preferredItemId) return null;
  const currentTarget = currentTargetObject(view, preferredItemId);
  const target = currentTarget ?? nearestObject(view, preferredItemId);
  if (!target || dist2d(view.self.pos, target.pos) > OBJECT_PICKUP_ARRIVAL_RANGE) return null;

  state.noTargetSinceMs = null;
  const commands: BrainCommand[] = [];
  if (view.self.targetId !== target.id && canIssue(state, `target:${target.id}`, input.nowMs, COMMAND_COOLDOWN_MS)) {
    commands.push({ cmd: 'target', id: target.id });
  }
  if (canIssue(state, `interact_object:${target.id}`, input.nowMs, 1_500)) {
    commands.push({ cmd: 'interact' });
  }
  return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, target.pos));
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
    if (dist2d(view.self.pos, target.pos) > OBJECT_PICKUP_ARRIVAL_RANGE) {
      return travelToPoint(
        view,
        state,
        input.liveState.seed ?? DEFAULT_WORLD_SEED,
        objective,
        { x: target.pos.x, z: target.pos.z },
        OBJECT_PICKUP_ARRIVAL_RANGE,
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
    input.liveState.seed ?? DEFAULT_WORLD_SEED,
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
  seed: number,
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
    return travelToPoint(
      view,
      state,
      seed,
      { id: 'combat', label },
      { x: target.pos.x, z: target.pos.z },
      preferredRange,
      movingTargetGoalKey(target),
      commands,
    );
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
    return travelToPoint(
      view,
      state,
      seed,
      { id: 'combat', label },
      { x: target.pos.x, z: target.pos.z },
      MELEE_RANGE + 0.3,
      movingTargetGoalKey(target),
      commands,
    );
  }
  return idleStep('combat', label, commands, facing);
}

function movingTargetGoalKey(target: BotEntityView): string {
  const x = Math.round(target.pos.x);
  const z = Math.round(target.pos.z);
  return `target:${target.id}:${x}:${z}`;
}

function travelToPoint(
  view: BotWorldView,
  state: AmbientPlayerBotBrainState,
  seed: number,
  objective: AmbientBotObjective,
  target: BotPoint2d,
  arrivalRange: number,
  goalKey: string,
  commands: readonly BrainCommand[] = [],
): AmbientPlayerBotBrainTickResult {
  if (dist2d(view.self.pos, pointToVec(target)) <= arrivalRange) {
    clearPath(state);
    return idleStep(objective.id, objective.label, commands, facingFor(view.self.pos, pointToVec(target)));
  }
  const nextPoint = ensurePath(view, state, seed, target, goalKey);
  return withTravelGoal(
    moveStep(objective.id, objective.label, facingFor(view.self.pos, pointToVec(nextPoint)), commands),
    target,
    arrivalRange,
    goalKey,
  );
}

export function continueAmbientPlayerBotTravel(
  liveState: AmbientPlayerBotLiveState,
  state: AmbientPlayerBotBrainState,
  objectiveId: string,
  objectiveLabel: string,
  goal: AmbientPlayerBotTravelGoal,
): AmbientPlayerBotBrainTickResult | null {
  const view = buildWorldView(liveState);
  if (!view) return null;
  return travelToPoint(
    view,
    state,
    liveState.seed ?? DEFAULT_WORLD_SEED,
    { id: objectiveId, label: objectiveLabel },
    goal.target,
    goal.arrivalRange,
    goal.goalKey,
  );
}

export function markAmbientPlayerBotBrainExternalProgress(
  state: AmbientPlayerBotBrainState,
  liveState: AmbientPlayerBotLiveState,
  nowMs: number,
): void {
  const self = liveState.self;
  const x = typeof self?.x === 'number' && Number.isFinite(self.x) ? self.x : null;
  const z = typeof self?.z === 'number' && Number.isFinite(self.z) ? self.z : null;
  if (x === null || z === null) return;
  state.lastX = x;
  state.lastZ = z;
  state.lastProgressAtMs = nowMs;
  clearPath(state);
}

export function ambientBrainSelfMaintenanceAllowedWhilePartyPaused(input: {
  result: AmbientPlayerBotBrainTickResult;
  groupMode: string;
  liveState: AmbientPlayerBotLiveState;
  maxTravelRange: number;
}): boolean {
  if (!isSelfMaintenanceGroupMode(input.groupMode)) return false;
  if (!isSelfMaintenanceObjective(input.result.objectiveId)) return false;
  if (!input.result.travelGoal) return true;
  const self = input.liveState.self;
  const selfX = typeof self?.x === 'number' && Number.isFinite(self.x) ? self.x : null;
  const selfZ = typeof self?.z === 'number' && Number.isFinite(self.z) ? self.z : null;
  if (selfX === null || selfZ === null) return false;
  return Math.hypot(input.result.travelGoal.target.x - selfX, input.result.travelGoal.target.z - selfZ)
    <= input.maxTravelRange;
}

function isSelfMaintenanceGroupMode(groupMode: string): boolean {
  return groupMode === 'follow_leader'
    || groupMode === 'hold_regroup'
    || groupMode === 'prepare_party'
    || groupMode === 'heal_party'
    || groupMode === 'buff_party';
}

function isSelfMaintenanceObjective(objectiveId: string): boolean {
  return (SELF_MAINTENANCE_OBJECTIVES as readonly string[]).includes(objectiveId)
    || objectiveId.startsWith('restock_')
    || objectiveId.startsWith('buy_');
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
    auras: readAuras(raw.auras),
    inventory: readInventory(raw.inv),
    equipment: readEquipment(raw.equip),
    partyMemberIds: readPartyMemberIds(raw.party, id),
    partyMembers: readPartyQuestMembers(raw.party),
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
    tappedById: readNumber(raw.tap),
    ownerId: readNumber(raw.own),
    corpseLoot: readCorpseLoot(raw.lootList),
  };
}

function readAuras(raw: unknown): BotAuraView[] {
  if (!Array.isArray(raw)) return [];
  const auras: BotAuraView[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    const id = record ? readString(record.id) : null;
    const kind = record ? readString(record.kind) : null;
    if (!id || !kind) continue;
    auras.push({
      id,
      kind,
      remaining: readNumber(record?.rem) ?? readNumber(record?.remaining) ?? 0,
      duration: readNumber(record?.dur) ?? readNumber(record?.duration) ?? 0,
    });
  }
  return auras;
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

function readCorpseLoot(raw: unknown): BotCorpseLoot | null {
  const record = readRecord(raw);
  if (!record) return null;
  const slots: BotLootSlot[] = [];
  if (Array.isArray(record.items)) {
    for (const slot of record.items) {
      const item = readRecord(slot);
      const itemId = item ? readString(item.itemId) : null;
      const count = item ? readNumber(item.count) : null;
      if (!itemId || count === null || count <= 0) continue;
      const personalFor = readNumberArray(item?.personalFor);
      slots.push({
        itemId,
        count,
        ...(personalFor.length > 0 ? { personalFor } : {}),
        ...(readBoolean(item?.openToAll) ? { openToAll: true } : {}),
      });
    }
  }
  return {
    copper: readNumber(record.copper) ?? 0,
    items: slots,
  };
}

function readPartyMemberIds(raw: unknown, selfId: number): ReadonlySet<number> {
  const ids = new Set<number>([selfId]);
  const record = readRecord(raw);
  if (!record || !Array.isArray(record.members)) return ids;
  for (const member of record.members) {
    const memberRecord = readRecord(member);
    const pid = memberRecord ? readNumber(memberRecord.pid) : null;
    if (pid !== null) ids.add(pid);
  }
  return ids;
}

function readPartyQuestMembers(raw: unknown): BotPartyQuestMemberView[] {
  const record = readRecord(raw);
  if (!record || !Array.isArray(record.members)) return [];
  const members: BotPartyQuestMemberView[] = [];
  for (const member of record.members) {
    const memberRecord = readRecord(member);
    const pid = memberRecord ? readNumber(memberRecord.pid) : null;
    if (pid === null) continue;
    members.push({
      id: pid,
      dead: readBoolean(memberRecord?.dead),
      questLog: new Map(readQuestLog(memberRecord?.qlog).map((quest) => [quest.questId, quest])),
      questsDone: new Set(readStringArray(memberRecord?.qdone)),
    });
  }
  return members;
}

function readEquipment(raw: unknown): Partial<Record<EquipSlot, string>> {
  const record = readRecord(raw);
  const equipment: Partial<Record<EquipSlot, string>> = {};
  if (!record) return equipment;
  for (const slot of Object.keys(record)) {
    if (!isEquipSlot(slot)) continue;
    const itemId = readString(record[slot]);
    if (itemId) equipment[slot] = itemId;
  }
  return equipment;
}

function isEquipSlot(value: string): value is EquipSlot {
  return value === 'mainhand'
    || value === 'helmet'
    || value === 'shoulder'
    || value === 'chest'
    || value === 'waist'
    || value === 'legs'
    || value === 'gloves'
    || value === 'feet';
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
    ? view.entities.find((entity) => entity.id === view.self.targetId && canLootCorpse(view.self, entity)) ?? null
    : null;
  if (current && dist2d(view.self.pos, current.pos) <= INTERACT_RANGE + 0.25) return current;
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (!canLootCorpse(view.self, entity)) continue;
    const distance = dist2d(view.self.pos, entity.pos);
    if (distance > INTERACT_RANGE + 0.25 || distance >= bestDistance) continue;
    best = entity;
    bestDistance = distance;
  }
  return best;
}

function canLootCorpse(self: BotSelfView, entity: BotEntityView): boolean {
  if (entity.kind !== 'mob' || !entity.dead || !entity.lootable) return false;
  const hasSharedLootRights =
    entity.tappedById === null ||
    entity.tappedById === self.id ||
    self.partyMemberIds.has(entity.tappedById);
  if (hasSharedLootRights) return true;
  const loot = entity.corpseLoot;
  if (!loot) return false;
  return loot.items.some((slot) =>
    (slot.openToAll && slot.count > 0) ||
    slot.personalFor?.includes(self.id),
  );
}

function findThreateningMob(view: BotWorldView): BotEntityView | null {
  return threateningMobs(view)[0] ?? null;
}

function threateningMobs(view: BotWorldView): BotEntityView[] {
  const threats: Array<{ entity: BotEntityView; distance: number }> = [];
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || entity.dead || !entity.hostile) continue;
    if (entity.aggroTargetId !== view.self.id) continue;
    threats.push({ entity, distance: dist2d(view.self.pos, entity.pos) });
  }
  threats.sort((a, b) => a.distance - b.distance);
  return threats.map((threat) => threat.entity);
}

function currentRouteHostileTarget(
  view: BotWorldView,
  templateIds: readonly string[],
  camps: readonly BotPoint2d[] | undefined,
  targetCampRadius: number | undefined,
): BotEntityView | null {
  if (view.self.targetId === null) return null;
  return view.entities.find(
    (entity) =>
      entity.id === view.self.targetId
      && entity.kind === 'mob'
      && entity.hostile
      && !entity.dead
      && templateIds.includes(entity.templateId)
      && isWithinTargetCamps(entity, camps, targetCampRadius),
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

function nearestHostileMob(
  view: BotWorldView,
  templateId: string,
  camps: readonly BotPoint2d[] | undefined,
  targetCampRadius: number | undefined,
): BotEntityView | null {
  let best: BotEntityView | null = null;
  let bestDistance = Infinity;
  for (const entity of view.entities) {
    if (entity.kind !== 'mob' || entity.dead || !entity.hostile || entity.templateId !== templateId) continue;
    if (entity.level > view.self.level + 2) continue;
    if (!isWithinTargetCamps(entity, camps, targetCampRadius)) continue;
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
  camps: readonly BotPoint2d[] | undefined,
  targetCampRadius: number | undefined,
): BotEntityView | null {
  for (const templateId of templateIds) {
    const mob = nearestHostileMob(view, templateId, camps, targetCampRadius);
    if (mob) return mob;
  }
  return null;
}

function isWithinTargetCamps(
  entity: BotEntityView,
  camps: readonly BotPoint2d[] | undefined,
  targetCampRadius: number | undefined,
): boolean {
  if (targetCampRadius === undefined || !camps || camps.length === 0) return true;
  return camps.some((camp) => dist2d(entity.pos, pointToVec(camp)) <= targetCampRadius);
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

function countHealingPotions(inventory: readonly InvSlot[]): number {
  let total = 0;
  for (const slot of inventory) {
    const item = ITEMS[slot.itemId];
    if (!item || item.kind !== 'potion' || !item.potionHp || slot.count <= 0) continue;
    total += slot.count;
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

function findHealingPotion(inventory: readonly InvSlot[]): string | null {
  let bestItemId: string | null = null;
  let bestHeal = 0;
  for (const slot of inventory) {
    const item = ITEMS[slot.itemId];
    if (!item || item.kind !== 'potion' || !item.potionHp || slot.count <= 0) continue;
    if (item.potionHp > bestHeal) {
      bestHeal = item.potionHp;
      bestItemId = slot.itemId;
    }
  }
  return bestItemId;
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

function grindRouteForView(view: BotWorldView): {
  mobId: string;
  camps: readonly BotPoint2d[];
  targetCampRadius?: number;
} {
  const self = view.self;
  const zoneId = zoneAt(self.pos.z).id;
  const level = self.level;
  if (zoneId === 'thornpeak_heights') {
    if (level <= 13) return { mobId: 'ridge_stalker', camps: campsFor('ridge_stalker') };
    if (level <= 14) return { mobId: 'deeprock_kobold', camps: campsFor('deeprock_kobold') };
    if (level <= 15) return { mobId: 'thornpeak_ogre', camps: campsFor('thornpeak_ogre') };
    if (level <= 17) return { mobId: 'stormcrag_elemental', camps: campsFor('stormcrag_elemental') };
    return { mobId: 'wyrmcult_zealot', camps: campsFor('wyrmcult_zealot') };
  }
  if (zoneId === 'mirefen_marsh') {
    if (level <= 7) return { mobId: 'mire_prowler', camps: campsFor('mire_prowler') };
    if (level <= 8) return { mobId: 'deepfen_murloc', camps: campsFor('deepfen_murloc') };
    if (level <= 10) return { mobId: 'mire_widow', camps: campsFor('mire_widow') };
    if (level <= 11) return { mobId: 'fen_troll', camps: campsFor('fen_troll') };
    return { mobId: 'gravecaller_cultist', camps: campsFor('gravecaller_cultist') };
  }
  if (level <= 3) return { mobId: 'forest_wolf', camps: campsFor('forest_wolf') };
  if (
    level <= 5
    && !self.questsDone.has('q_boars')
    && !self.questsDone.has('q_spiders')
    && !self.questLog.has('q_murlocs')
    && !self.questLog.has('q_supplies')
  ) {
    return {
      mobId: 'wild_boar',
      camps: EASTBROOK_SAFE_BOAR_CAMPS,
      targetCampRadius: EASTBROOK_SAFE_BOAR_TARGET_RADIUS,
    };
  }
  if (
    level === 5
    && self.questsDone.has('q_murlocs')
    && hasNearbyFullPartyAtLevel(view, 5)
  ) {
    return { mobId: 'mudfin_murloc', camps: campsFor('mudfin_murloc') };
  }
  const useWebwoodPartyGrindCamps = shouldUseWebwoodPartyGrindCamps(view);
  return {
    mobId: 'webwood_spider',
    camps: useWebwoodPartyGrindCamps
      ? EASTBROOK_WEBWOOD_PARTY_GRIND_CAMPS
      : campsFor('webwood_spider'),
    ...(useWebwoodPartyGrindCamps
      ? { targetCampRadius: EASTBROOK_WEBWOOD_PARTY_GRIND_TARGET_RADIUS }
      : {}),
  };
}

function hasNearbyFullPartyAtLevel(view: BotWorldView, minLevel: number): boolean {
  const levels = nearbyContributingPartyLevels(view);
  return levels.length >= 5 && levels.every((level) => level >= minLevel);
}

function shouldUseWebwoodPartyGrindCamps(view: BotWorldView): boolean {
  const self = view.self;
  return self.level === 4
    && self.questsDone.has('q_spiders')
    && !self.questsDone.has('q_murlocs')
    && hasNearbyFullPartyAtLevel(view, 4);
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

function withTravelGoal(
  step: AmbientPlayerBotBrainTickResult,
  target: BotPoint2d,
  arrivalRange: number,
  goalKey: string,
): AmbientPlayerBotBrainTickResult {
  return {
    ...step,
    travelGoal: {
      target: { x: target.x, z: target.z },
      arrivalRange,
      goalKey,
    },
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

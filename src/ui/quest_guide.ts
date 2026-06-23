import type { CampDef, CorpseLoot, GroundObjectDef, LootEntry, MobTemplate, NpcDef, QuestDef, QuestObjective, QuestProgress } from '../sim/types';

export interface QuestGuidePosition {
  x: number;
  z: number;
}

export interface QuestGuideEntity {
  id: number;
  kind: 'player' | 'mob' | 'npc' | 'object';
  templateId: string;
  pos: QuestGuidePosition;
  dead: boolean;
  lootable: boolean;
  loot: CorpseLoot | null;
  objectItemId: string | null;
}

export type QuestGuideMarkerKind = 'objective' | 'turnIn';

export interface QuestGuideMarker {
  kind: QuestGuideMarkerKind;
  questId: string;
  objectiveIndex: number | null;
  x: number;
  z: number;
  distanceSq: number;
}

export interface QuestGuideInput {
  player: QuestGuidePosition;
  questLog: Iterable<QuestProgress>;
  quests: Record<string, QuestDef>;
  entities: Iterable<QuestGuideEntity>;
  npcs: Record<string, Pick<NpcDef, 'id' | 'pos'>>;
  camps: readonly Pick<CampDef, 'mobId' | 'center'>[];
  groundObjects: readonly Pick<GroundObjectDef, 'itemId' | 'positions'>[];
  mobs: Record<string, Pick<MobTemplate, 'id' | 'loot'>>;
  maxMarkers?: number;
}

function distanceSq(a: QuestGuidePosition, b: QuestGuidePosition): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function lootCanProvide(entry: LootEntry, itemId: string, questId: string): boolean {
  return entry.itemId === itemId && (entry.questId === undefined || entry.questId === questId);
}

function corpseHasItem(loot: CorpseLoot | null, itemId: string): boolean {
  return !!loot?.items.some((item) => item.itemId === itemId && item.count > 0);
}

function nearest(player: QuestGuidePosition, positions: QuestGuidePosition[]): QuestGuidePosition | null {
  let best: QuestGuidePosition | null = null;
  let bestD = Infinity;
  for (const pos of positions) {
    const d = distanceSq(player, pos);
    if (d < bestD) {
      best = pos;
      bestD = d;
    }
  }
  return best;
}

function turnInPositions(quest: QuestDef, entities: readonly QuestGuideEntity[], npcs: QuestGuideInput['npcs']): QuestGuidePosition[] {
  const positions = entities
    .filter((entity) => entity.kind === 'npc' && entity.templateId === quest.turnInNpcId)
    .map((entity) => entity.pos);
  const npc = npcs[quest.turnInNpcId];
  if (npc) positions.push(npc.pos);
  return positions;
}

function mobDropsItem(mobs: QuestGuideInput['mobs'], mobId: string, itemId: string, questId: string): boolean {
  return mobs[mobId]?.loot.some((entry) => lootCanProvide(entry, itemId, questId)) ?? false;
}

function objectivePositions(
  objective: QuestObjective,
  questId: string,
  entities: readonly QuestGuideEntity[],
  input: QuestGuideInput,
): QuestGuidePosition[] {
  const positions: QuestGuidePosition[] = [];
  if (objective.type === 'kill' && objective.targetMobId) {
    positions.push(...entities
      .filter((entity) => entity.kind === 'mob' && entity.templateId === objective.targetMobId && !entity.dead)
      .map((entity) => entity.pos));
    positions.push(...input.camps
      .filter((camp) => camp.mobId === objective.targetMobId)
      .map((camp) => camp.center));
  }

  if (objective.type === 'collect' && objective.itemId) {
    const itemId = objective.itemId;
    positions.push(...entities
      .filter((entity) => entity.kind === 'object' && entity.objectItemId === itemId)
      .map((entity) => entity.pos));
    positions.push(...entities
      .filter((entity) => entity.kind === 'mob'
        && ((entity.lootable && corpseHasItem(entity.loot, itemId))
          || (!entity.dead && mobDropsItem(input.mobs, entity.templateId, itemId, questId))))
      .map((entity) => entity.pos));
    positions.push(...input.groundObjects
      .filter((object) => object.itemId === itemId)
      .flatMap((object) => object.positions));
    positions.push(...input.camps
      .filter((camp) => mobDropsItem(input.mobs, camp.mobId, itemId, questId))
      .map((camp) => camp.center));
  }

  if (objective.type === 'interact') {
    if (objective.targetObjectItemId) {
      positions.push(...entities
        .filter((entity) => entity.kind === 'object' && entity.objectItemId === objective.targetObjectItemId)
        .map((entity) => entity.pos));
      positions.push(...input.groundObjects
        .filter((object) => object.itemId === objective.targetObjectItemId)
        .flatMap((object) => object.positions));
    }
    if (objective.targetNpcId) {
      positions.push(...entities
        .filter((entity) => entity.kind === 'npc' && entity.templateId === objective.targetNpcId)
        .map((entity) => entity.pos));
      const npc = input.npcs[objective.targetNpcId];
      if (npc) positions.push(npc.pos);
    }
  }
  return positions;
}

export function questGuideMarkers(input: QuestGuideInput): QuestGuideMarker[] {
  const entities = [...input.entities];
  const markers: QuestGuideMarker[] = [];

  for (const progress of input.questLog) {
    const quest = input.quests[progress.questId];
    if (!quest || progress.state === 'done') continue;

    if (progress.state === 'ready') {
      const pos = nearest(input.player, turnInPositions(quest, entities, input.npcs));
      if (pos) {
        markers.push({
          kind: 'turnIn',
          questId: progress.questId,
          objectiveIndex: null,
          x: pos.x,
          z: pos.z,
          distanceSq: distanceSq(input.player, pos),
        });
      }
      continue;
    }

    quest.objectives.forEach((objective, objectiveIndex) => {
      if ((progress.counts[objectiveIndex] ?? 0) >= objective.count) return;
      const pos = nearest(input.player, objectivePositions(objective, progress.questId, entities, input));
      if (!pos) return;
      markers.push({
        kind: 'objective',
        questId: progress.questId,
        objectiveIndex,
        x: pos.x,
        z: pos.z,
        distanceSq: distanceSq(input.player, pos),
      });
    });
  }

  markers.sort((a, b) => a.distanceSq - b.distanceSq || a.questId.localeCompare(b.questId) || (a.objectiveIndex ?? -1) - (b.objectiveIndex ?? -1));
  return input.maxMarkers !== undefined ? markers.slice(0, Math.max(0, input.maxMarkers)) : markers;
}

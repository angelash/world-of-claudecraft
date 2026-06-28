import type { KnownAbility } from '../../src/sim/content/classes';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import type { TalentAllocation } from '../../src/sim/content/talents';
import { abilitiesKnownAt, ITEMS } from '../../src/sim/data';
import type { InvSlot } from '../../src/sim/types';
import type { AmbientPlayerBotRecord } from './types';

type PreCombatCommand = Record<string, unknown>;
type CommandGate = (key: string, cooldownMs: number) => boolean;

export interface PreCombatAuraView {
  id: string;
  kind: string;
  remaining: number;
  duration: number;
}

export interface PreCombatSelfView {
  id: number;
  level: number;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  resourceType: string;
  gcdRemaining: number;
  cooldowns: Record<string, number>;
  castingAbility: string | null;
  eatingRemaining: number | null;
  drinkingRemaining: number | null;
  inventory: readonly InvSlot[];
  auras: readonly PreCombatAuraView[];
  talents: TalentAllocation | null;
}

export interface PreCombatEntityView {
  kind: string;
  dead: boolean;
  ownerId: number | null;
}

export interface PreCombatPreparationInput {
  bot: AmbientPlayerBotRecord;
  self: PreCombatSelfView;
  entities: readonly PreCombatEntityView[];
  issueCommand: CommandGate;
}

export interface PreCombatPreparationStep {
  objectiveId: 'prepare_combat' | 'recover';
  objectiveLabel: string;
  commands: readonly PreCombatCommand[];
}

const PREPARE_LABEL = 'Preparing for combat';
const RESTORE_MANA_LABEL = 'Restoring mana before pull';
const PREP_CAST_COOLDOWN_MS = 900;
const PREP_LONG_CAST_COOLDOWN_MS = 1_600;
const PREP_USE_COOLDOWN_MS = 3_000;
const PRE_PULL_MANA_RATIO = 0.45;
const MIN_SAFE_LIFE_TAP_HP_RATIO = 0.55;

const WARLOCK_SUMMON_PRIORITY = [
  'summon_doomguard',
  'summon_infernal',
  'summon_felguard',
  'summon_felhunter',
  'summon_succubus',
  'summon_voidwalker',
  'summon_imp',
] as const;

const PRE_COMBAT_BUFF_PRIORITY: Partial<Record<AmbientPlayerBotRecord['class'], readonly string[]>> = {
  warrior: ['battle_shout', 'commanding_shout'],
  mage: ['frost_armor', 'arcane_intellect', 'ice_barrier'],
  rogue: ['deadly_poison', 'instant_poison', 'crippling_poison'],
  paladin: ['devotion_aura', 'blessing_of_might', 'seal_of_righteousness'],
  hunter: ['aspect_of_the_hawk'],
  priest: ['power_word_fortitude', 'power_word_shield'],
  shaman: ['rockbiter_weapon', 'lightning_shield'],
  warlock: ['demon_skin'],
  druid: ['mark_of_the_wild', 'thorns'],
};

export function maybePrepareForPull(input: PreCombatPreparationInput): PreCombatPreparationStep | null {
  const { self } = input;
  if (self.castingAbility) return waitToPrepare();
  if (self.eatingRemaining !== null || self.drinkingRemaining !== null) return waitToRestoreMana();

  const abilities = knownAbilitiesFor(input.bot, self);
  const summon = pickMissingSummon(input, abilities);
  if (summon) return castPreparedAbility(input, summon, true);

  const buff = pickMissingBuff(input.bot, self, abilities);
  if (buff) return castPreparedAbility(input, buff, false);

  return maybeRestoreManaForPull(input, pullManaRequirement(abilities));
}

function knownAbilitiesFor(
  bot: AmbientPlayerBotRecord,
  self: PreCombatSelfView,
): KnownAbility[] {
  const mods = self.talents ? computeTalentModifiers(bot.class, self.talents) : undefined;
  return abilitiesKnownAt(bot.class, self.level, mods);
}

function pickMissingSummon(
  input: PreCombatPreparationInput,
  abilities: readonly KnownAbility[],
): KnownAbility | null {
  if (input.bot.class !== 'warlock' || hasOwnedPet(input.self, input.entities)) return null;
  const knownById = new Map(abilities.map((ability) => [ability.def.id, ability]));
  for (const abilityId of WARLOCK_SUMMON_PRIORITY) {
    const ability = knownById.get(abilityId);
    if (ability && ability.effects.some((effect) => effect.type === 'summonDemon')) return ability;
  }
  return null;
}

function hasOwnedPet(
  self: PreCombatSelfView,
  entities: readonly PreCombatEntityView[],
): boolean {
  return entities.some((entity) => entity.kind === 'mob' && !entity.dead && entity.ownerId === self.id);
}

function pickMissingBuff(
  bot: AmbientPlayerBotRecord,
  self: PreCombatSelfView,
  abilities: readonly KnownAbility[],
): KnownAbility | null {
  const priority = PRE_COMBAT_BUFF_PRIORITY[bot.class] ?? [];
  const knownById = new Map(abilities.map((ability) => [ability.def.id, ability]));
  for (const abilityId of priority) {
    const ability = knownById.get(abilityId);
    if (!ability || !hasPreCombatEffect(ability)) continue;
    if (!isPreparedByAura(self, ability)) return ability;
  }
  return null;
}

function hasPreCombatEffect(ability: KnownAbility): boolean {
  return ability.effects.some(
    (effect) =>
      effect.type === 'selfBuff'
      || effect.type === 'buffTarget'
      || effect.type === 'imbue'
      || effect.type === 'absorb',
  );
}

function isPreparedByAura(self: PreCombatSelfView, ability: KnownAbility): boolean {
  const effects = ability.effects.filter(
    (effect) =>
      effect.type === 'selfBuff'
      || effect.type === 'buffTarget'
      || effect.type === 'imbue'
      || effect.type === 'absorb',
  );
  return effects.length > 0 && effects.every((effect) => {
    const refreshBelow = auraRefreshBelow(effect.duration);
    return self.auras.some((aura) => {
      if (aura.remaining <= refreshBelow) return false;
      if (aura.id === ability.def.id) return true;
      if (effect.type === 'selfBuff' || effect.type === 'buffTarget') return aura.kind === effect.kind;
      if (effect.type === 'imbue') return aura.kind === 'imbue';
      return false;
    });
  });
}

function auraRefreshBelow(duration: number): number {
  if (duration <= 60) return 5;
  return Math.min(30, Math.max(8, duration * 0.2));
}

function castPreparedAbility(
  input: PreCombatPreparationInput,
  ability: KnownAbility,
  requiredSetup: boolean,
): PreCombatPreparationStep | null {
  const { self } = input;
  if (!canAttemptAbility(self, ability)) {
    if (self.gcdRemaining > 0.05 || self.castingAbility) return waitToPrepare();
    return null;
  }
  if (self.resource < ability.cost) {
    const restore = maybeRestoreManaForCost(input, ability.cost);
    if (restore) return restore;
    if (requiredSetup && self.resourceType === 'mana' && self.maxResource >= ability.cost) return waitToRestoreMana();
    return null;
  }
  const cooldownMs = ability.castTime > 0 ? PREP_LONG_CAST_COOLDOWN_MS : PREP_CAST_COOLDOWN_MS;
  if (input.issueCommand(`cast:${ability.def.id}`, cooldownMs)) {
    return prepareStep([{ cmd: 'cast', ability: ability.def.id }]);
  }
  return waitToPrepare();
}

function canAttemptAbility(self: PreCombatSelfView, ability: KnownAbility): boolean {
  if (!ability.def.offGcd && self.gcdRemaining > 0.05) return false;
  if (self.castingAbility) return false;
  return (self.cooldowns[ability.def.id] ?? 0) <= 0.05;
}

function maybeRestoreManaForPull(
  input: PreCombatPreparationInput,
  requiredCost: number,
): PreCombatPreparationStep | null {
  return maybeRestoreManaForCost(input, requiredCost);
}

function maybeRestoreManaForCost(
  input: PreCombatPreparationInput,
  requiredCost: number,
): PreCombatPreparationStep | null {
  const { self } = input;
  if (self.resourceType !== 'mana' || self.maxResource <= 0) return null;
  const belowPreferredMana = self.resource / self.maxResource < PRE_PULL_MANA_RATIO;
  const belowRequiredCost = self.resource < requiredCost;
  if (!belowPreferredMana && !belowRequiredCost) return null;

  const drink = findConsumable(self.inventory, 'drink');
  if (drink && input.issueCommand(`use:${drink}`, PREP_USE_COOLDOWN_MS)) {
    return recoverStep([{ cmd: 'use', item: drink }]);
  }
  if (drink) return waitToRestoreMana();

  const abilities = knownAbilitiesFor(input.bot, self);
  const conjureWater = abilities.find((ability) => ability.def.id === 'conjure_water') ?? null;
  if (!drink && conjureWater && self.resource >= conjureWater.cost && input.issueCommand('cast:conjure_water', PREP_LONG_CAST_COOLDOWN_MS)) {
    return prepareStep([{ cmd: 'cast', ability: 'conjure_water' }]);
  }
  if (!drink && conjureWater && self.resource >= conjureWater.cost) return waitToPrepare();

  const lifeTap = abilities.find((ability) => ability.def.id === 'life_tap') ?? null;
  if (lifeTap && canLifeTapSafely(self, lifeTap) && input.issueCommand('cast:life_tap', PREP_CAST_COOLDOWN_MS)) {
    return recoverStep([{ cmd: 'cast', ability: 'life_tap' }]);
  }

  if (belowRequiredCost) return waitToRestoreMana();
  return null;
}

function canLifeTapSafely(self: PreCombatSelfView, ability: KnownAbility): boolean {
  if (!canAttemptAbility(self, ability)) return false;
  const hpCost = ability.effects.reduce((cost, effect) => (
    effect.type === 'lifeTap' ? Math.max(cost, effect.hp) : cost
  ), 0);
  if (hpCost <= 0 || self.maxHp <= 0) return false;
  return self.hp - hpCost >= self.maxHp * MIN_SAFE_LIFE_TAP_HP_RATIO;
}

function pullManaRequirement(abilities: readonly KnownAbility[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const ability of abilities) {
    if (!isOpeningDamageAbility(ability)) continue;
    if (ability.cost < best) best = ability.cost;
  }
  return Number.isFinite(best) ? best : 0;
}

function isOpeningDamageAbility(ability: KnownAbility): boolean {
  if (!ability.def.requiresTarget) return false;
  if (ability.def.targetType === 'friendly') return false;
  if (ability.def.requiresStealth || ability.def.requiresOutOfCombat || ability.def.requiresDodgeProc) return false;
  if (ability.def.requiresTargetHpBelow || ability.def.spendsCombo) return false;
  return ability.effects.some(
    (effect) =>
      effect.type === 'directDamage'
      || effect.type === 'weaponDamage'
      || effect.type === 'weaponStrike'
      || effect.type === 'dot',
  );
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

function prepareStep(commands: readonly PreCombatCommand[]): PreCombatPreparationStep {
  return {
    objectiveId: 'prepare_combat',
    objectiveLabel: PREPARE_LABEL,
    commands,
  };
}

function recoverStep(commands: readonly PreCombatCommand[]): PreCombatPreparationStep {
  return {
    objectiveId: 'recover',
    objectiveLabel: RESTORE_MANA_LABEL,
    commands,
  };
}

function waitToPrepare(): PreCombatPreparationStep {
  return prepareStep([]);
}

function waitToRestoreMana(): PreCombatPreparationStep {
  return recoverStep([]);
}

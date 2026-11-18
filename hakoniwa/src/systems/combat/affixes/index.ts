// The monster mechanic field registry in the kernel (combat_and_classes.md 11): every field
// a monster record may carry, with where the kernel reads it. `FIRST_ACT_FIELDS` lists the
// fields whose first need is act one (all read by the kernel, each pinned by a data-driven
// test in tests/boss_mechanics.test.ts); content validation refuses mechanic keys outside
// the registry.

export {
  AMBUSH_TAG,
  ambushMult,
  ambushWatch,
  CARAVAN_TAG,
  caravanTarget,
  fleePoint,
  movementTraits,
  onDied,
  onSpawned,
  renewBlight,
  spawnAllowed,
} from './life';
export { HIT_AFFIXES, onHitAffixes } from './on_hit';
export { purifyHit } from './purify';
export { DESPERATE_HEAL, desperatePct, tickTimedAffixes } from './timed';

/** Mechanic fields the first-round kernel already read (section 11 "核"). */
export const KERNEL_FIELDS: readonly string[] = [
  'flee',
  'enrage',
  'summon',
  'phases',
  'yieldAtPct',
  'yieldSay',
  'despawnAfterYield',
  'ramp',
  'onHit',
  'passives',
  'social',
  'pacifiedBy',
  'removeOnFlag',
  'presence',
  'partySync',
  'duelWatch',
  'petGroup',
  'petQuirk',
  'ownerAura',
];

/** The boss library's keys (section 10.2). */
export const LIBRARY_FIELDS: readonly string[] = [
  'adds',
  'berserk',
  'marks',
  'interruptWindows',
  'shields',
  'terrain',
  'resolve',
  'arena',
  'targeting',
  'doorSeek',
];

/** Registry fields whose first need is act one (section 11 "首需 一"), read by the kernel. */
export const FIRST_ACT_FIELDS: readonly string[] = [
  'aoePulse',
  'stomp',
  'bigCast',
  'stoneskin',
  'aoeSlow',
  'charge',
  'desperateHeal',
  'soulrot',
  'smolder',
  'mortalStrike',
  'concuss',
  'stunOnHit',
  'ensnare',
  'knockback',
  'corrode',
  'blind',
  'demoralize',
  'thorns',
  'frenzyOnHit',
  'packFrenzy',
  'deathThroes',
  'ccImmune',
  'slowImmune',
  'ignoreTaunt',
  'phasesThroughObstacles',
  'canSwim',
  'componentTags',
  'purifyTo',
  'rumorScale',
  'nameInherit',
  'pilfer',
  'corpseRise',
  'cropBlight',
  'caravanRaid',
  'nightOnly',
  'weatherSpawn',
  'ambushEmerge',
  'crystalEat',
  'ashPuddle',
  'lureFlee',
  'breakableParts',
  'oathLock',
];

/** Every mechanic key a monster record may carry. */
export const MECHANIC_KEYS: ReadonlySet<string> = new Set([
  ...KERNEL_FIELDS,
  ...LIBRARY_FIELDS,
  ...FIRST_ACT_FIELDS,
]);

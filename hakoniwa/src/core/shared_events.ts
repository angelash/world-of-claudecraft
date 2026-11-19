// Cross-system events declared centrally so systems developed independently can emit
// and subscribe without importing each other's modules. A system that owns the fact
// emits it; any system may subscribe. Milestones are additionally mirrored as world
// flags (ctx.setFlag) so quests and the reveal ledger can test them as conditions.
// Text fields carry a TextParam (src/core/text.ts): a TextRef for text the kernel
// composes, a plain string for content display names and the player's own words.

import type { TextParam } from './text';

declare module './contracts' {
  interface EventMap {
    /** A notable deed an onlooker could witness (cognition, rumors, reputation). */
    'feat.performed': {
      actorId: string;
      /** kill, boss_kill, heal, spell, rescue, build, trade, duel, miracle, ... */
      kind: string;
      /** magnitude on the tier scale 0 (mundane) to 7 (beyond); see power_system.md 3 */
      tier: number;
      mapId: string;
      x: number;
      y: number;
      targetId?: string;
      targetRef?: string;
      note?: TextParam;
    };
    /** Any entity died (combat owns the fact). */
    'entity.died': {
      id: string;
      /** display name at death, so listeners need not look the entity up */
      name?: string;
      ref?: string;
      kind: string;
      killerId?: string;
      mapId: string;
      x: number;
      y: number;
    };
    /** The player spoke free text or chose a line (dialogue and scenes own the fact). */
    'player.said': { text: TextParam; toId?: string; mapId: string };
    /** The player started talking to an NPC. */
    'player.talked': { npcId: string; npcRef?: string };
    'player.level_up': { level: number };
    /** Experience granted by any system (quests, discoveries); combat applies it. */
    'xp.awarded': { entityId: string; amount: number; reason: TextParam };
    /** A door of the Thousand Doors opened (doors owns the fact). */
    'door.opened': { doorId: string; sealDelta: number };
    /** A gameplay feature became available (flag feature.<name> is set as well). */
    'feature.unlocked': { feature: string };
    /** The story act changed (quests owns the fact; flag 'act' is set as well). */
    'act.changed': { from: string; to: string };
    /**
     * Interaction menu extension point. When the player talks to an NPC (player.talked),
     * any system may offer options (quests, shops, shrines, recruitment). The dialogue
     * system owns the open conversation, shows the options, and emits
     * dialogue.option_chosen back to the offering system.
     */
    'dialogue.options_offered': {
      npcId: string;
      system: string;
      options: { id: string; label: TextParam; hint?: TextParam }[];
    };
    'dialogue.option_chosen': { npcId: string; system: string; optionId: string };
    /**
     * The intent classifier's R8 response step fired (builtin_ai.md 6.5): a free-text
     * intent raised a notification (guard, clergy, goddess, audit) toward a system that
     * has not subscribed yet (PK-M1-18). Dialogue owns the fact; nothing consumes it today.
     */
    'dialogue.notified': {
      npcId: string;
      npcRef: string;
      notify: string;
      intent: string;
      /**
       * an audit's reason: suspected_spoiler, a locked clue named in words the classifier
       * did not understand (builtin_ai.md 6.6)
       */
      reason?: string;
      /** the lore ids the audited words named */
      clues?: string[];
    };
    /** A line to show in the conversation box and the log (any system may emit). */
    'dialogue.line': {
      speakerId: string;
      speakerName: TextParam;
      text: TextParam;
      listenerId?: string;
      kind: 'say' | 'think' | 'narrate' | 'divine';
    };
    'building.completed': { buildingId: string; defId: string; siteId: string };
    'battle.ended': { battleId: string; victor: 'player' | 'enemy' | 'draw'; scenario?: string };
  }
}

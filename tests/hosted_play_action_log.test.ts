import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { AmbientPlayerBotBrainTickResult } from '../server/ambient_bots/brain';
import { hostedPlayActionLogForResult } from '../server/hosted_play/action_log';
import { DUNGEONS, QUESTS } from '../src/sim/data';
import { dungeonDisplayNameFromSource, questTitleFromSource } from '../src/ui/entity_display_core';
import {
  ensureLocaleLoaded,
  getLanguage,
  setLanguage,
  supportedLanguages,
  t,
} from '../src/ui/i18n';
import { localizeSystemText } from '../src/ui/system_text_i18n';

const HUD_SRC = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/hud.ts'), 'utf8');

function brainResult(
  patch: Partial<AmbientPlayerBotBrainTickResult>,
): AmbientPlayerBotBrainTickResult {
  return {
    objectiveId: '',
    objectiveLabel: '',
    moveInput: {},
    commands: [],
    ...patch,
  };
}

describe('hostedPlayActionLogForResult', () => {
  it('maps high-signal hosted-play objectives to chat lines', () => {
    const questName = QUESTS['q_boars']?.name ?? 'q_boars';
    const dungeonName = DUNGEONS['hollow_crypt']?.name ?? 'hollow_crypt';
    const samples = [
      [
        brainResult({
          objectiveId: 'accept_boars',
          objectiveLabel: `Picking up ${questName}`,
          objectiveQuestId: 'q_boars',
        }),
        `Hosted play: heading to accept ${questName}.`,
      ],
      [
        brainResult({
          objectiveId: 'hunt_boars',
          objectiveLabel: `Collecting ${questName}`,
          objectiveQuestId: 'q_boars',
        }),
        `Hosted play: working on ${questName}.`,
      ],
      [
        brainResult({
          objectiveId: 'turnin_boars',
          objectiveLabel: `Turning in ${questName}`,
          objectiveQuestId: 'q_boars',
        }),
        `Hosted play: heading to turn in ${questName}.`,
      ],
      [
        brainResult({
          objectiveId: 'restock_food_and_drink',
          objectiveLabel: 'Buying supplies',
        }),
        'Hosted play: heading to a vendor for supplies.',
      ],
      [
        brainResult({
          objectiveId: 'buy_eastbrook_arming_sword',
          objectiveLabel: 'Buying Eastbrook Arming Sword',
        }),
        'Hosted play: heading to a vendor for an upgrade.',
      ],
      [
        brainResult({
          objectiveId: 'enter_crypt',
          objectiveLabel: `Gathering a party for ${questName}`,
          objectiveQuestId: 'q_boars',
          objectiveDungeonId: 'hollow_crypt',
        }),
        `Hosted play: gathering a party for ${questName}.`,
      ],
      [
        brainResult({
          objectiveId: 'leave_crypt',
          objectiveLabel: `Leaving ${dungeonName} for turn-in`,
          objectiveQuestId: 'q_boars',
          objectiveDungeonId: 'hollow_crypt',
        }),
        `Hosted play: leaving ${dungeonName}.`,
      ],
      [
        brainResult({
          objectiveId: 'recover',
          objectiveLabel: 'Recovering between pulls',
        }),
        'Hosted play: recovering between pulls.',
      ],
      [
        brainResult({
          objectiveId: 'recover',
          objectiveLabel: 'Retreating from a dangerous pull',
        }),
        'Hosted play: retreating to safety.',
      ],
      [
        brainResult({
          objectiveId: 'release',
          objectiveLabel: 'Releasing spirit',
        }),
        'Hosted play: releasing spirit.',
      ],
    ] as const;

    for (const [result, expected] of samples) {
      expect(hostedPlayActionLogForResult(result)?.text).toBe(expected);
    }
  });

  it('keeps every hosted-play action log recognized by the HUD system-text matcher', async () => {
    expect(HUD_SRC).toContain("import { localizeSystemText } from './system_text_i18n'");
    expect(HUD_SRC).toContain('localizeSystemText(this.bankWindow.observeStorageText(ev.text))');
    const questName = QUESTS['q_boars']?.name ?? 'q_boars';
    const dungeonName = DUNGEONS['hollow_crypt']?.name ?? 'hollow_crypt';
    const previousLanguage = getLanguage();
    try {
      await ensureLocaleLoaded('zh_CN');
      setLanguage('zh_CN');
      const quest = { quest: questTitleFromSource(questName) };
      const dungeon = { dungeon: dungeonDisplayNameFromSource(dungeonName) };
      const samples = [
        [`Hosted play: heading to accept ${questName}.`, 'hudChrome.hostedPlay.log.accept', quest],
        [`Hosted play: working on ${questName}.`, 'hudChrome.hostedPlay.log.questWork', quest],
        [`Hosted play: heading to turn in ${questName}.`, 'hudChrome.hostedPlay.log.turnIn', quest],
        ['Hosted play: heading to a vendor for supplies.', 'hudChrome.hostedPlay.log.resupply'],
        ['Hosted play: heading to a vendor for an upgrade.', 'hudChrome.hostedPlay.log.upgrade'],
        ['Hosted play: grinding for experience.', 'hudChrome.hostedPlay.log.grind'],
        ['Hosted play: recovering between pulls.', 'hudChrome.hostedPlay.log.recover'],
        ['Hosted play: retreating to safety.', 'hudChrome.hostedPlay.log.retreat'],
        ['Hosted play: releasing spirit.', 'hudChrome.hostedPlay.log.release'],
        [
          `Hosted play: gathering a party for ${questName}.`,
          'hudChrome.hostedPlay.log.gatherParty',
          quest,
        ],
        [`Hosted play: leaving ${dungeonName}.`, 'hudChrome.hostedPlay.log.leaveDungeon', dungeon],
        [
          `Hosted play: leaving the dungeon for ${questName}.`,
          'hudChrome.hostedPlay.log.leaveDungeonForQuest',
          quest,
        ],
      ] as const;
      for (const [sample, key, values] of samples) {
        expect(localizeSystemText(sample), sample).toBe(t(key, values));
        expect(localizeSystemText(sample), sample).not.toBe(sample);
      }
      expect(localizeSystemText('An unrelated action.')).toBe('An unrelated action.');
    } finally {
      setLanguage(previousLanguage);
    }
  });

  it('ships real locale text for the new hosted-play UI and log keys', async () => {
    const englishLabel = 'Chat Action Log';
    const englishLog = 'Hosted play: heading to a vendor for supplies.';

    const previousLanguage = getLanguage();
    try {
      for (const lang of supportedLanguages) {
        await ensureLocaleLoaded(lang);
        setLanguage(lang);
        const label = t('hudChrome.hostedPlay.actionLogLabel');
        const log = t('hudChrome.hostedPlay.log.resupply');
        if (lang === 'en' || lang === 'en_CA') {
          expect(label).toBe(englishLabel);
          expect(log).toBe(englishLog);
        } else {
          expect(label, `${lang} label fallback`).not.toBe(englishLabel);
          expect(log, `${lang} log fallback`).not.toBe(englishLog);
        }
      }
    } finally {
      setLanguage(previousLanguage);
    }
  });
});

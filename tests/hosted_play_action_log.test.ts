import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DUNGEONS, QUESTS } from '../src/sim/data';
import { hostedPlayActionLogForResult } from '../server/hosted_play/action_log';
import type { AmbientPlayerBotBrainTickResult } from '../server/ambient_bots/brain';
import { ensureLocaleLoaded, setLanguage, supportedLanguages, t } from '../src/ui/i18n';

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

function localizeSystemArm(): { exact: Set<string>; regexes: RegExp[] } {
  const start = HUD_SRC.indexOf('private localizeSystemText(text: string): string {');
  if (start < 0) throw new Error('localizeSystemText not found');
  let depth = 0;
  let end = HUD_SRC.indexOf('{', start);
  for (; end < HUD_SRC.length; end++) {
    if (HUD_SRC[end] === '{') depth++;
    else if (HUD_SRC[end] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = HUD_SRC.slice(start, end + 1);
  const exact = new Set<string>();
  const exactRe = /(?:^|\n)\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/g;
  for (const match of body.matchAll(exactRe)) {
    exact.add(JSON.parse(match[1][0] === "'" ? `"${match[1].slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"` : match[1]));
  }
  const regexes: RegExp[] = [];
  const regexRe = /\/((?:\\.|[^/\\\n])+)\/([gimsuy]*)\.exec\(text\)/g;
  for (const match of body.matchAll(regexRe)) {
    regexes.push(new RegExp(match[1], match[2].replace('g', '')));
  }
  return { exact, regexes };
}

function recognizedByHud(text: string): boolean {
  const arm = localizeSystemArm();
  if (arm.exact.has(text)) return true;
  return arm.regexes.some((regex) => {
    regex.lastIndex = 0;
    return regex.test(text);
  });
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

  it('keeps every hosted-play action log recognized by the HUD system-text matcher', () => {
    const questName = QUESTS['q_boars']?.name ?? 'q_boars';
    const dungeonName = DUNGEONS['hollow_crypt']?.name ?? 'hollow_crypt';
    const samples = [
      `Hosted play: heading to accept ${questName}.`,
      `Hosted play: working on ${questName}.`,
      `Hosted play: heading to turn in ${questName}.`,
      'Hosted play: heading to a vendor for supplies.',
      'Hosted play: heading to a vendor for an upgrade.',
      'Hosted play: grinding for experience.',
      'Hosted play: recovering between pulls.',
      'Hosted play: retreating to safety.',
      'Hosted play: releasing spirit.',
      `Hosted play: gathering a party for ${questName}.`,
      `Hosted play: leaving ${dungeonName}.`,
      `Hosted play: leaving the dungeon for ${questName}.`,
    ];

    for (const sample of samples) {
      expect(recognizedByHud(sample), sample).toBe(true);
    }
  });

  it('ships real locale text for the new hosted-play UI and log keys', async () => {
    const englishLabel = 'Chat Action Log';
    const englishLog = 'Hosted play: heading to a vendor for supplies.';

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
    setLanguage('en');
  });
});

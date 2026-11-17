// The player-visible text fields of the content (release_engineering.md 7.4 V5 and V8):
// names, titles, labels, descriptions and spoken lines the client renders. Fields that
// only feed AI prompts or designers (goddess private goals and act knowledge, persona
// goals, secrets and voice rules, ledger lore and terms, dev notes) are not listed. The
// content text keys are generated from exactly these fields (c.<table>.<id>.<field>,
// implementation_conventions.md 8), so a field missing here is a text without a key.
//
// Length limits: the interface documents fix only the speech bubble (three lines of at
// most 14 characters, ux_and_onboarding.md, ui_ovl_speech); the other classes are the
// window limits of the current HUD, kept with headroom over the longest shipped text.

import type { ContentPack } from '../../../src/content/pack';
import { valuesAt } from '../../../src/content/paths';
import type { ContentMap } from '../../../src/core/contracts';

export type TextClass = 'name' | 'title' | 'label' | 'desc' | 'line' | 'bark';

/** Maximum characters per class (code points). */
export const TEXT_LIMITS: Readonly<Record<TextClass, number>> = {
  name: 20,
  title: 24,
  label: 40,
  desc: 120,
  line: 200,
  bark: 42,
};

export interface TextField {
  table: string;
  path: string;
  cls: TextClass;
  /** row field holding the condition under which the text is shown (a revealed name) */
  gate?: string;
  /** an empty string means "nothing to show" here (a wordless revelation, the narrator) */
  blankOk?: boolean;
  /** the path also addresses non-text values (a line written as an object); skip those */
  textOnly?: boolean;
  /**
   * line packs: the text's own gate is the `when` of the line object holding it, and a
   * text under `acts.<act>.` is first visible in that act
   */
  linePack?: boolean;
}

const f = (table: string, cls: TextClass, ...paths: string[]): TextField[] =>
  paths.map((path) => ({ table, path, cls }));

/** Fields shown only once the row's revealWhen condition holds (the name switch of a reveal). */
const revealed = (table: string, cls: TextClass, ...paths: string[]): TextField[] =>
  paths.map((path) => ({ table, path, cls, gate: 'revealWhen' }));

export const PLAYER_TEXT: readonly TextField[] = [
  ...f('abilities', 'name', 'name'),
  ...f('abilities', 'desc', 'desc'),
  ...f('abilities', 'bark', 'say'),
  ...f('acts', 'title', 'title'),
  ...f('atlas_maps', 'name', 'name'),
  ...f('atlas_regions', 'name', 'name'),
  ...f('atlas_routes', 'label', 'road', 'opens'),
  ...f('auras', 'name', 'name'),
  ...f('auras', 'desc', 'desc'),
  ...f(
    'battle_scenarios',
    'name',
    'name',
    'reinforcements[].regiments[].name',
    'reinforcements[].heroes[].name',
    'teams.*.general.name',
    'teams.*.heroes[].name',
    'teams.*.regiments[].name',
    'zones[].name',
  ),
  ...f('battle_scenarios', 'desc', 'desc'),
  ...f(
    'battle_scenarios',
    'label',
    'objectives[].label',
    'reinforcements[].label',
    'teams.*.general.traits[]',
  ),
  ...f('city_buildings', 'name', 'name'),
  ...f('city_buildings', 'desc', 'desc'),
  ...f('city_officials', 'name', 'name'),
  ...f('city_officials', 'desc', 'desc'),
  ...f('city_officials', 'label', 'creed'),
  ...f('city_policies', 'name', 'name'),
  ...f('city_policies', 'desc', 'desc'),
  ...f('city_sites', 'name', 'name'),
  ...f('classes', 'name', 'name'),
  ...f('classes', 'desc', 'desc'),
  ...f('cognitionExplanations', 'label', 'identity', 'label'),
  ...f('combatFixtures', 'name', 'name'),
  ...f('companions', 'name', 'name'),
  ...f('companions', 'title', 'title'),
  ...f('companions', 'label', 'personality[]'),
  ...f('codexEntries', 'desc', 'text'),
  ...f('courtDefenses', 'line', 'askBack.*', 'broken.*', 'deflect', 'verdictLines.*'),
  ...f('deeds', 'name', 'name'),
  ...f('deeds', 'desc', 'desc'),
  ...f('directorMenu', 'label', 'label'),
  // line packs (data/dialogue/lines/): every line, plain or with conditions, per slot and
  // per version, base and per act; lengths per slot family and the line's shape are the
  // line validator's (./lines.ts), so the class here is the widest one
  ...['slots.*[]', 'slots.*.*[]', 'acts.*.*[]', 'acts.*.*.*[]'].flatMap((list) => [
    { table: 'linePacks', path: list, cls: 'line' as const, textOnly: true, linePack: true },
    {
      table: 'linePacks',
      path: `${list}.zh`,
      cls: 'line' as const,
      textOnly: true,
      linePack: true,
    },
  ]),
  ...f('directorMenu', 'line', 'narration'),
  ...f('divineActions', 'label', 'label'),
  ...f('divineActions', 'line', 'lines.*[]'),
  ...f('doors', 'name', 'name'),
  ...f('doors', 'desc', 'desc'),
  ...f('doors', 'label', 'hint', 'keys[].label', 'keys[].of[].label'),
  ...f('economy_config', 'name', 'company.name', 'competitor.name'),
  ...f('epilogue', 'name', 'subject'),
  ...f('epilogue', 'line', 'text'),
  ...f('evidence', 'title', 'name'),
  ...f('evidence', 'line', 'presentText'),
  // a goddess with a hidden name (revealWhen) shows hiddenName until the reveal
  ...revealed('goddesses', 'name', 'name', 'fullName'),
  ...f('goddesses', 'name', 'hiddenName'),
  ...revealed('goddesses', 'title', 'title', 'honorific'),
  ...f('goddesses', 'desc', 'publicGoal'),
  ...f('goddesses', 'line', 'anchors[]', 'replies.*'),
  ...f('hero_abilities', 'name', 'name'),
  ...f('hero_abilities', 'desc', 'desc'),
  ...f('items', 'name', 'name'),
  ...f('letters', 'title', 'subject'),
  ...f('letters', 'name', 'senderName'),
  ...f('letters', 'line', 'body[].text'),
  ...f('letters', 'label', 'replies[].label'),
  ...f('items', 'desc', 'desc'),
  ...f('maps', 'name', 'name', 'locations[].name'),
  ...f('maps', 'label', 'exits[].label'),
  ...f('markets', 'name', 'name'),
  ...f('markets', 'desc', 'desc'),
  ...f('mercaIntel', 'line', 'text'),
  ...f('monsters', 'name', 'name', 'mechanics.phases[].name'),
  ...f('monsters', 'desc', 'desc'),
  ...f(
    'monsters',
    'line',
    'mechanics.enrage.say',
    'mechanics.phases[].say',
    'mechanics.summon[].say',
    'mechanics.yieldSay',
  ),
  ...f('npcResidents', 'name', 'name', 'race'),
  ...f('npcs', 'name', 'name', 'race'),
  ...f('npcs', 'label', 'job', 'potential'),
  ...f('npcs', 'desc', 'intro'),
  ...f('npcs', 'bark', 'lines.**', 'voice.catchphrases[]'),
  ...f('quests', 'title', 'title'),
  ...f('quests', 'desc', 'desc', 'stages[].desc'),
  ...f('quests', 'label', 'stages[].objectives[].label'),
  ...f('quests', 'line', 'onStart[].text', 'rewards[].text', 'stages[].onEnter[].text'),
  ...f('regiment_types', 'name', 'name'),
  ...f('regiment_types', 'desc', 'desc'),
  ...f('revelations', 'line', 'literal', 'responses.*'),
  // the steles can go dark: a revelation without words
  { table: 'revelations', path: 'text', cls: 'line', blankOk: true },
  // the narrator speaks without a name label
  { table: 'sceneSpeakers', path: 'name', cls: 'name', blankOk: true },
  ...revealed('sceneSpeakers', 'name', 'revealedName'),
  ...f('scenes', 'title', 'title'),
  ...f('scenes', 'name', 'nodes[].lines[].name', 'nodes[].input.empty'),
  ...f('scenes', 'label', 'nodes[].choices[].label', 'nodes[].input.prompt'),
  ...f(
    'scenes',
    'line',
    'nodes[].lines[].text',
    'nodes[].choices[].effects[].text',
    'nodes[].input.reply[].text',
  ),
  ...f(
    'slg_config',
    'name',
    'playerNation.name',
    'playerNation.short',
    'playerNation.ruler.name',
    'playerNation.armies[].name',
    'playerNation.armies[].general',
  ),
  ...f('slg_nations', 'name', 'name', 'short', 'ruler.name', 'armies[].name', 'armies[].general'),
  ...f('slg_provinces', 'name', 'name'),
  ...f('slg_provinces', 'desc', 'desc'),
  ...f('titles', 'title', 'name'),
  ...f('titles', 'label', 'grantedBy', 'visibleTo', 'loss'),
  ...f('trade_recipes', 'name', 'name'),
  ...f('trade_recipes', 'desc', 'desc'),
  ...f('trade_routes', 'name', 'name'),
  ...f('waves', 'name', 'name'),
];

export interface PlayerText {
  table: string;
  /** row id; for an object table the table name; '' for a row without an id */
  row: string;
  path: string;
  value: unknown;
  cls: TextClass;
  /** condition the text waits for (the gate field's value), when the field has one */
  gate?: string;
  /** the act from which this text is shown, when the text itself says (a line pack's acts.<act>) */
  act?: string;
  blankOk?: boolean;
  /** the row the text sits in */
  source: unknown;
}

/** A line pack text's act (`acts.<act>.` paths) and gate (the `when` of its line object). */
function lineScope(pack: unknown, path: string): { act?: string; gate?: string } {
  const act = /^acts.([a-z0-9]+)./.exec(path)?.[1];
  if (!path.endsWith('.zh')) return { act };
  const at = valuesAt(pack, path.slice(0, -3).replace(/[(d+)]/g, '[]'));
  const owner = at.find((v) => `${v.path}.zh` === path)?.value as { when?: unknown } | undefined;
  return {
    act,
    gate: typeof owner?.when === 'string' && owner.when !== '' ? owner.when : undefined,
  };
}

/** Rows of a table: an array table's rows (keyed by idField), an object table as one row. */
export function tableRows(
  content: ContentMap,
  table: string,
  idField = 'id',
): { row: string; value: unknown }[] {
  const v = (content as unknown as Record<string, unknown>)[table];
  if (Array.isArray(v)) {
    return v.map((r) => {
      const id = (r as Record<string, unknown> | null)?.[idField];
      return { row: typeof id === 'string' ? id : '', value: r };
    });
  }
  return v && typeof v === 'object' ? [{ row: table, value: v }] : [];
}

/** Every player-visible text value of the content (any value type, for V8 to judge). */
export function playerTexts(
  content: ContentMap,
  fields: readonly TextField[] = PLAYER_TEXT,
  idFields: Readonly<Record<string, string>> = {},
): PlayerText[] {
  const out: PlayerText[] = [];
  for (const field of fields) {
    for (const { row, value } of tableRows(content, field.table, idFields[field.table])) {
      const gate = field.gate ? (value as Record<string, unknown>)[field.gate] : undefined;
      for (const p of valuesAt(value, field.path)) {
        if (field.textOnly && typeof p.value !== 'string') continue;
        const scope = field.linePack ? lineScope(value, p.path) : {};
        const own = typeof gate === 'string' && gate !== '' ? gate : undefined;
        out.push({
          table: field.table,
          row,
          path: p.path,
          value: p.value,
          cls: field.cls,
          gate: scope.gate ?? own,
          act: scope.act,
          blankOk: field.blankOk,
          source: value,
        });
      }
    }
  }
  return out;
}

/** Id field of each table as its pack schema declares it (court defenses key by goddess). */
export function idFieldsOf(packs: readonly ContentPack[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of packs) for (const s of p.schemas ?? []) out[s.table] ??= s.idField;
  return out;
}

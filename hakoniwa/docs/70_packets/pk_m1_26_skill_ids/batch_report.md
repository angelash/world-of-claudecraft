# content_act1_abilities_01 batch report

- Scope: catalog_abilities_talents.md 3.3, 4.5 and 7.3: the act 1 equipment aura, the contract fiend of the act 1 abyss pact door with its skills, and the downed state aura; the sk_/aur_ renumbering of every existing ability and aura id (2, 3, 7) lands beside it as renames (data/registry/renames.json version 2)
- Depends on: none
- Status: promoted

## Ids

- combat/auras.json (auras)
  - added: aur_ember_door, aur_st_downed_weak
  - changed: none
- combat/monsters.json (monsters)
  - added: fiend_colossus_remnant
  - changed: none
- combat/abilities.json (abilities)
  - added: sk_lok_summonremnant, sk_mon_remnantbar, sk_mon_remnantquake
  - changed: none
  - removed: none

## Validation

M0, 2026-11-17: all green

- V1 schema: 0 errors, 0 warnings
- V2 references: 0 errors, 0 warnings
- V3 namespaces: 0 errors, 0 warnings
- V4 variable registry: 0 errors, 337 warnings
- V5 reveal ledger: 0 errors, 9 warnings
- V6 numeric bands: 0 errors, 9 warnings
- V7 asset references: 0 errors, 3 warnings
- V8 text: 0 errors, 0 warnings
- V9 reachability: 0 errors, 9 warnings
- V10 proper nouns: 0 errors, 0 warnings

## Steps

1. scope (2026-11-17): `node tools/content/import_catalog.ts extract --mapping abilities.equipment_auras --batch content_act1_abilities_01 --scope "catalog_abilities_talents.md 3.3, 4.5 and 7.3: the act 1 equipment aura, the contract fiend of the act 1 abyss pact door with its skills, and the downed state aura; the sk_/aur_ renumbering of every existing ability and aura id (2, 3, 7) lands beside it as renames (data/registry/renames.json version 2)"`. catalog_abilities_talents.md 3.3, 4.5 and 7.3: the act 1 equipment aura, the contract fiend of the act 1 abyss pact door with its skills, and the downed state aura; the sk_/aur_ renumbering of every existing ability and aura id (2, 3, 7) lands beside it as renames (data/registry/renames.json version 2)
2. extract (2026-11-17): `node tools/content/import_catalog.ts extract --mapping abilities.equipment_auras --batch content_act1_abilities_01 --scope "catalog_abilities_talents.md 3.3, 4.5 and 7.3: the act 1 equipment aura, the contract fiend of the act 1 abyss pact door with its skills, and the downed state aura; the sk_/aur_ renumbering of every existing ability and aura id (2, 3, 7) lands beside it as renames (data/registry/renames.json version 2)"`. 1 records, 3 unmapped cells, 1 fields to fill
2. extract (2026-11-17): `node tools/content/import_catalog.ts extract --mapping abilities.fiend_templates --batch content_act1_abilities_01`. 1 records, 6 unmapped cells, 8 fields to fill
2. extract (2026-11-17): `node tools/content/import_catalog.ts extract --mapping abilities.fiend_skills --batch content_act1_abilities_01`. 3 records, 6 unmapped cells, 9 fields to fill
2. extract (2026-11-17): `node tools/content/import_catalog.ts extract --mapping abilities.state_auras_death --batch content_act1_abilities_01 --ids aur_st_downed_weak`. 1 records, 3 unmapped cells, 3 fields to fill
3. fill (2026-11-17): `node tools/content/import_catalog.ts fill --batch content_act1_abilities_01 --note "author fill from catalog_abilities_talents.md 3.3, 4.5 and 7.3: descriptions, kinds, durations and mods; the fiend template's family, levels, multipliers, movement, skills and look; the skills' targets, costs, cooldowns and effects"`. author fill from catalog_abilities_talents.md 3.3, 4.5 and 7.3: descriptions, kinds, durations and mods; the fiend template's family, levels, multipliers, movement, skills and look; the skills' targets, costs, cooldowns and effects
4. validate (2026-11-17): `node tools/content/import_catalog.ts validate --batch content_act1_abilities_01 --milestone M1`. failing (0 fields to fill)
4. validate (2026-11-17): `node tools/content/import_catalog.ts validate --batch content_act1_abilities_01 --milestone M0`. V1 to V10 green
5. promote (2026-11-17): `node tools/content/import_catalog.ts promote --batch content_act1_abilities_01`. into combat/auras.json, combat/monsters.json, combat/abilities.json
6. verify (2026-11-17): `node tools/content/import_catalog.ts verify --batch content_act1_abilities_01 --note "npm test: 2826 passed, 3 failed outside this batch (text_keys.generated, art manifest, audio registry literal); own_ability_ids, save_renames, save_migration, content_validation, combat, doors, doors_costs, party, records_save, docs_guard: 192 passed; playthrough release, rule_merca, act1_minimal: 3 passed (740.85 s); no balance simulation: the contract fiend template is not on any route, batch simulation in PK-M1-42"`. npm test: 2826 passed, 3 failed outside this batch (text_keys.generated, art manifest, audio registry literal); own_ability_ids, save_renames, save_migration, content_validation, combat, doors, doors_costs, party, records_save, docs_guard: 192 passed; playthrough release, rule_merca, act1_minimal: 3 passed (740.85 s); no balance simulation: the contract fiend template is not on any route, batch simulation in PK-M1-42
7. report (2026-11-17): `node tools/content/import_catalog.ts report --batch content_act1_abilities_01 --out docs/70_packets/pk_m1_26_skill_ids/batch_report.md`

## 换号（同批落地，不经暂存）

- 技能 123 个、光环 84 个按技能目录第 2、3.2 节换成 `sk_`、`aur_`；显示名改 11 个（技能 2、光环 9）；光环 `door_step` 并入 `aur_door_dodge`，`enrage` 换成状态光环 `aur_st_enrage`；删除 0。
- 引用改写：技能 209 处、光环 89 处（字段见 `batch_card.md`）；渊契之门加授 `sk_lok_summonremnant`。
- 重命名表 `data/registry/renames.json` 第 2 版：`ability` 123 条、`aura` 84 条，事件字段 5 条；第 4 步校验的 M1 档失败来自既有的 V5 `guardian_raven` 条目，与本批次无关，按 M0 校验合入。

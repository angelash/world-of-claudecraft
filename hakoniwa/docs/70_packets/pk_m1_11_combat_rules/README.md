# PK-M1-11 战斗规则扩展（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-11` 战斗规则扩展 |
| 状态 | 进行中（实施与验证已完成，待主会话确认封包） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-11` |
| 形态 | 小包（量级 4 代理人日，按小包三件写；范围按战斗文档第 20 节 M1 行与第 21.2 节归本包的行切分） |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-01（战斗文档第一幕所需各节，已完成）、PK-M0-29（已完成）；承接 PK-M1-26（自有技能编号，已提交 `b1da694eb7`）、PK-M1-14（千门第一批，已完成）转来的遗留 |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

[战斗与职能系统][cmb]第 20 节标 M1、且第 21 节归本包的验收行在内核里成立：位阶威压的新表与场效应缺省、控制的递减与免疫与位阶缩放、
命中事件的音效选择字段、光环的按施加者与同组取最强、驱散顺序、死亡五项代价与复苏、难度四档、编外者的技架与门授资源池、
单挑与 `duel.ended`、记功口径与受击推迟；连同 PK-M1-26 转来的血契、残意习性与契约魔一只的限制。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 门授资源池：当架池、脱战换脉、双脉与三脉的驱动与换算 | `src/systems/combat/pools.ts`；命令 `combat.switch_pool`；事件 `combat.pool_switched` | [战斗][cmb] 4.3；[千门][td] 9.4、9.5 |
| 2 | 编外者技架：8 到 24 格，随门授与升级自动补位，战斗中锁定 | `src/systems/combat/rack.ts`；命令 `combat.rack`；`rackView` | [战斗][cmb] 7；[技能目录][abl] 4.3 |
| 3 | 位阶威压新表、控制时长的位阶系数、场效应（缺省 6 格，首次进入的失神每次遭遇一次）、抗压 | `src/systems/combat/formulas.ts`（`presencePenalty`、`presenceCcFactor`）、`presence.ts`；光环 `aur_st_presence_*` | [战斗][cmb] 3.5、9.3 |
| 4 | 控制：递减十类阶梯与 18 秒重置、谁递减、按首领层次与族群的免疫、修正范围、对轴系数、缴械、破除 | `src/systems/combat/control.ts`、`auras.ts`、`stats.ts` | [战斗][cmb] 9.1 到 9.3、9.7 |
| 5 | 命中事件的音效选择字段（`weaponClass`、`damageKind`、`material`、`heavy`、`ranged`），每种结果都带 | `src/systems/combat/presentation.ts`、`damage.ts` | [战斗][cmb] 8.3；[音频方向][aud] 7.16 |
| 6 | 光环按施加者、同组取最强、按层数的效果表；驱散最近施加者优先并按类别过滤 | `src/systems/combat/auras.ts`、`stats.ts` | [战斗][cmb] 8.2、9.5 |
| 7 | 死亡五项代价与结算顺序：过载、遗落包、耐久（库存系统端口）、目击、回廊中复苏、复苏门疲状态、扩展的 `combat.player_returned` | `src/systems/combat/death.ts`、`death_costs.ts`；`src/systems/doors/costs.ts` 读门疲下限 | [战斗][cmb] 15.1；[千门][td] 6.3、第 23 节 Y 行 |
| 8 | 难度四档：注册的修正项（`combat` 目标）、脱战切换、传说档锁定 | `src/systems/combat/difficulty.ts`；`src/systems/modifiers/index.ts` 增 `combat` 目标 | [战斗][cmb] 16；[成长][prg] 15 |
| 9 | 单挑与 `duel.ended`：非致死、首领单挑的生命系数、观战者 `duelWatch` | `src/systems/combat/duel.ts`；命令 `combat.duel` | [战斗][cmb] 17.4、19.2；任务模型的决斗目标 |
| 10 | 可读性清单的数据面：施法事件的可打断标记、光环的类别与驱散边框与递减角标、免疫与递减的 `resisted` | `src/systems/combat/queries.ts`、`abilities.ts`、`auras.ts` | [战斗][cmb] 18 |
| 11 | 记功（玩家方十分之一伤害）、受击推迟至多两次、同伴本场倒地计数、战斗结束的耐久 | `rewards.ts`、`damage.ts`、`death.ts`、`death_costs.ts` | [战斗][cmb] 8.5、3.9、15.2、13.2 |
| 12 | 状态光环按战斗文档重写；血契 `aur_lok_remnantpact`（生命上限百分比修正与随召唤物在场的挂载）；残意在封门遗迹附近不听命令；契约魔同一时刻一只 | `data/combat/auras.json`、`monsters.json`；`src/systems/combat/summons.ts`、`monster_ai.ts` | [战斗][cmb] 3.5、15.1、15.3、12.3；[技能目录][abl] 4.5、7 |
| 13 | 内容校验：魔物对玩家方控制的基础时长上限与学派锁定上限；新字段的引用与取值 | `src/content/packs/combat.ts`（`monsterControlCaps`、`validateCombat`） | [战斗][cmb] 9.1 |
| 14 | 与物品实例层（PK-M1-13）的战斗侧：结算 `item.proc`、报 `combat_start` 与 `low_hp` 两个触发点、挂套组光环、消耗品冷却组在战斗中的禁用与公共冷却（命令 `combat.use_item`）、遗落包用库存包裹 | `src/systems/combat/item_procs.ts`、`proc_points.ts`、`items_use.ts`、`death_costs.ts` | [战斗][cmb] 13、14.1 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 首领机制库（预警、增援、护盾、地形、打断窗口、点名、阶段计时）与第 11 节注册表字段、看到的灵压 | PK-M1-12 |
| 2 | 物品实例、耐久本体、`procs`、套组、澱纹与精炼、消耗品冷却组与投掷 | PK-M1-13（本包只在死亡与战斗结束时调用它的端口） |
| 3 | 醉意、药毒、澱病三阶、伤病五类的施加与消退 | PK-M1-13、PK-M1-51 |
| 4 | 同伴重伤退场、追赶倍数、对危险区的反应与规避 | PK-M1-15（本包给出倒地计数与难度的修正项） |
| 5 | 技能数值按 `S(L)` 的全量重算 | PK-M1-42（理由见 `progress.md`） |
| 6 | 界面：施法条边框、光环角标、遗落包地图标记、技架窗口、难度切换页 | PK-M1-22、PK-M1-57 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、实体字段只经世界端口、文本键 |
| [战斗][cmb] 3 到 9、15 到 21 节 | 本包的规则与验收行 |
| [千门][td] 6.3、9.4、9.5、第 23 节 | 死亡代价、当架池 |
| `src/systems/combat/`（各模块文件头的说明） | 改动的接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 随机只走命名流（恐惧破除走 `combat.proc`，只在身上有恐惧时抽） | `tests/architecture.test.ts` |
| 系统边界 | 战斗不导入千门、任务；库存端口经守卫导入；实体只经世界端口 | `tests/architecture.test.ts` |
| 文本 | 新拒绝原因与难度修正项说明是 `sys.combat.*` 键 | `node tools/i18n/check.ts` |
| 内容编号 | 系统代码不写地图与地点编号：复苏地点读带 `revive` 标签的地点，残意习性读魔物数据 | `tests/content_id_guard.test.ts` |

## 6. 文件范围

见 `progress.md` 的改动文件表。越界改动：`src/systems/modifiers/index.ts`（增 `combat` 目标）、`src/systems/doors/costs.ts` 与 `index.ts`（门疲下限与过载层数读回执）、
`src/systems/party/ai.ts`（同伴不插手单挑）、`tests/own_ability_ids.test.ts`（PK-M1-26 的钉子加后续导入的编号）、`docs/40_design/world_state_registry.md`（`feature` 一行加双脉两值）。

## 7. 停止条件

dev_process 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/combat_rules.test.ts tests/combat.test.ts tests/doors_costs.test.ts tests/own_ability_ids.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸 | 必派 | 一次贡献结束 |
| 新起会话的差异审查 | 必派 | 规则面广，覆盖与确定性 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、文档回写、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 遗落包只取哪些物品 | 只取可堆叠的消耗品、材料与货物，钥匙、遗物书籍与证据不遗落（推荐：丢失剧情物会卡任务；代码与战斗 15.1、千门 6.3 已按此写）；或一律取每一叠可堆叠物品 | 不阻塞 |

[cmb]: ../../40_design/systems/combat_and_classes.md
[td]: ../../40_design/systems/thousand_doors.md
[abl]: ../../40_design/content/catalog_abilities_talents.md
[aud]: ../../40_design/audio_direction.md
[prg]: ../../40_design/progression_and_pacing.md

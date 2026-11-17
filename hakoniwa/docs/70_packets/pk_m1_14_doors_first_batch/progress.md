# PK-M1-14 千门系统第一批：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 | 门阶、封印三量、`seal_unrest`、淤塞与门疲、十六个钥原语与四种组合、替钥与序钥、物钥、第一幕互斥组、提示导演与序章门缝、回廊段与翼、43 扇门改写、21.6 八条校验、回廊窗口门槛；覆盖性复查与修复 | 未提交 | 本包测试 85 个全过；相邻套件 214 个全过；默认套件 2400 过、2 个基线失败；内容校验全绿；release 与第一幕极简两条路线在复查修复之后通过（`Tests 2 passed (2)`，1590.86 秒） | 主会话提交；遗留按第 3 节转出 |

## 2. 汇报

### 2026-11-17 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/doors/types.ts` | 修改 | 新字段（段、翼、厅、主线、倾向、松动档、禁门、`unrest`、门阶值、失灵、互斥条目）；钥十六原语与四种组合；切片新字段；事件 `doors.rank_up`、`doors.blockage_tier`、`doors.hint`、`seal.stage_up`；常量 `WINGS`、`SEAL_TIERS`、`TENDENCIES`、`EXCLUSIVE_MODES`、`COUNTABLE_EVENTS`、`KEY_TYPES` |
| `src/systems/doors/index.ts` | 修改 | 开门按 3.5 的顺序结算；闭门 `closeDoor`；刷新单次读门；旗标同步（幕、序章倾向、回廊、封印、澱染、淤塞、门疲）；入梦与门旱提示 |
| `src/systems/doors/keys.ts` | 修改 | 判定的十六原语与组合、替钥与缺位、`started` 语义、`readDoor`、序钥计数阻挡、显影钥计数、`consumedItems` |
| `src/systems/doors/view.ts` | 修改 | 段、翼、厅、显示档、门缝档不给门名、钥按显示档披露、`corridorOpen`、`corridorLayout`、`doorCosts`、`wingName` |
| `src/systems/doors/rank.ts` | 新增 | 门阶曲线（整数形式）与查表 |
| `src/systems/doors/seal.ts` | 新增 | 半分、镜像、按幕封顶的阶段、饱和、闭门回落、内容写入的同步、`unrestDelta` |
| `src/systems/doors/slice.ts` | 新增 | 新切片与旧存档补字段（门阶、封印、互斥的幕锁回补、缺的门条目） |
| `src/systems/doors/costs.ts` | 新增 | 淤塞（十分之一点存储、档位）、澱染折算、门疲与消退、退回门内的过载 |
| `src/systems/doors/exclusive.ts` | 新增 | `lock`、`actLock`、`forceClose`、`vanish`、`source`；撤回幕锁 |
| `src/systems/doors/hints.ts` | 新增 | 段的生长、序章门缝、提示导演（候选、得分、强度、渠道、每日两次、一夜一梦、门旱传闻） |
| `src/systems/doors/state.ts` | 新增 | 状态转移与显示档 |
| `src/systems/doors/sequence.ts` | 新增 | 序钥推进与作废 |
| `src/content/packs/doors.ts` | 修改 | 新字段的表单；21.6 八条校验与三条补充 |
| `data/doors/doors.json` | 修改 | 43 扇门的新字段；X 编号互斥组；识才之门第三把钥改为"一位凡人当众担保"（任一信任 80）；猎之门、借形之门的替钥；澄流之门按 C89 改为灵泉守或（借形之门已开时）欧拉 80；名讳之门 `auto` |
| `data/doors/rank_curve.json` | 新增 | 1 到 99 阶的门槛（工具生成） |
| `tools/doors/rank_curve.ts` | 新增 | 生成与 `--check` |
| `locales/zh-Hans/sys_doors.json` | 修改 | 十四个翼名 |
| `src/systems/combat/formulas.ts`、`src/systems/combat/death.ts` | 修改（越界最小改动） | 复苏门疲状态时长改为 2 + floor(门阶 / 10) 个游戏时辰（上限 10）乘过载，读旗标 `door_rank` |
| `tests/combat.test.ts` | 修改（越界最小改动） | 门阶 1 的复苏门疲 120 分钟 |
| `src/client/windows/window_registry.ts` | 修改（越界最小改动） | 回廊窗口 `requiresAll: ['feature.door_corridor']` |
| `docs/40_design/world_state_registry.md` | 修改（越界最小改动） | 第 8.5 节新族 `taught.<门>.<人>`；第 8.2 节 `seal_unrest`、`blockage`、`door_fatigue` 的写入方标 doors |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 工具重生成 | 含其他并行包的条目 |
| `docs/40_design/systems/thousand_doors.md` | 修改 | 回写 4.3、5.1、5.4、5.8、6.2、8、9.1、18.3、21.1、21.4、21.6 |
| `tests/doors_harness.ts`、`tests/doors_rank_seal.test.ts`、`tests/doors_costs.test.ts`、`tests/doors_keys.test.ts`、`tests/doors_exclusive.test.ts`、`tests/doors_hints.test.ts`、`tests/doors_validation.test.ts`、`tests/doors_features.test.ts` | 新增 | 第 23 节 M1 行 |
| `tests/doors.test.ts` | 修改 | 新数值（初门·醒微档 0.5、渊契 4、破门 10）与识才之门的第三把钥 |

**自行定下的地方**

1. 21.6 第 3 条"只落在一个人身上"的口径：开门必需（不在 `any`、`alt` 之内）的 `trust` 钥、读 `trust.<id>` 的旗标钥与只写一位师傅的 `taught` 钥；同伴的 `bond` 钥按同伴系统的离队与铁人规则另管，不在本条（信使之门、启才之门的门目录没有替钥）。已回写千门 5.4。
2. 缺位判定读 `npc.<id>.dead`、`companion.<id>.state`（`left`、`dead`）、`companion.<id>.lost`；内容里还没有的人物也算缺位。被捕、敌对、在泉畔待 NPC 系统给出变量。
3. `alt` 加可选条件 `when`：原钥不落在人物身上或替钥另有时机时用（借形之门、澄流之门）。
4. `trust` 钥的人物写 `*` 时读任一人物的最高信任，承接识才之门"一位凡人当众担保（任一 NPC 信任 80 以上）"。
5. 显影的"进度"：满足、计数或持有或胜场有一份、组合里有子钥有进度；信任与门阶读数本身不算，否则开局的人设信任与门阶 1 会让许多门立刻显影。
6. X2 写作 `actLock`、`act` 1、`until` 3（门目录 X2 行"第三幕开始回到未见"）；单向组（X9、X12）的发动方写 `source`。
7. 提示渠道名 `tendency`（序章门缝，不占每日两次）、`dream`、`rumor`；门缝等回廊显形；入梦一夜一次；门旱超过 120 分钟且当天无提示时一天试一次传闻，只讲带地点或人物钥的门。
8. 淤塞以十分之一点存整数，旗标 `blockage` 取整；澱染折算读澱染系统写的镜像 `player.taint` 的增量。
9. 过载按一个游戏日的滚动窗口计（与战斗现行的死亡计数同口径）。
10. 旧存档不加迁移：首次触及时由已开的门推门阶、由封印旗标推半分、补幕锁的回归幕与缺的门条目，冻结存档的迁移哈希不变。
11. 门阶值逐门写在数据里（不在运行时推）；门目录"段尾之厅"的门带 `hall`，主线门（17.3 极简清单）带 `main`，序章倾向对应的门带 `tendency`（刃、兽、息、契、影、灵对刃之门、猎之门、借形之门、识才之门、伪录之门、术式之门）。

**遗留**

| 遗留 | 建议的包 |
| --- | --- |
| 遗落包、`combat.player_returned` 按战斗 19.4 扩展（过载层数、遗落包、复苏时长、门疲下限、目击） | PK-M1-11 |
| 已装备物品死亡耐久 -10% | PK-M1-13 |
| 功能 `servant` 的读取方（从契） | PK-M1-15 |
| HUD 门镜部件；回廊界面按显示档与"还差 N 把"的版式（视图已给 `hintLevel`、`nameShown`、`keysLeft`、`segment`、`wing`） | PK-M1-22 |
| `door_messenger` 的传书声明、`a3_ash_warning_doors` 之后的阶段名、`keySets`（渊契之门第三幕版本，借形先开时移除 `dian_core`）、失灵、门技门疲、各翼的生长规则、提示导演的钥孔鲤与师傅台词渠道和有模型时的润色、`door.opened` 的 `tier` 与 `rankDelta`、`door_state.<门>` 镜像 | PK-M2-13 |
| 第一幕缺的 8 扇门、门相句、C88 信使之门与 C89 聆灵、立国、终门的钥重写 | PK-M1-32 及后续内容批次 |
| 内容直接写封印（第一幕开场置 5、梦境 +5、各幕场景 +5 到 +15、任务 +1，`max` 100 越过饱和 99）与 C84 的预算不符 | PK-M1-33、PK-M1-27 的重导批次 |
| NPC 的被捕、敌对、在泉畔三种缺位状态的变量 | PK-M1-18 |
| 传闻渠道只发 `doors.hint` 事件，没有真正注入当地传闻池 | 认知系统的传闻接口所在包（PK-M1-18 或 PK-M2-13） |

**风险**

- 回廊窗口现在要 `feature.door_corridor`：初门·醒开启之前（序章与第一幕第一战之前）菜单里没有回廊窗口，这是设计要求的行为。
- 澄流之门的钥按 C89 改为灵泉守 `nassia_dawndew`（尚不在数据里）或欧拉 80 加借形之门：常规路线在人物入库之前开不了这扇门。

**建议状态**：本包的 M1 行除"遗落"与 `servant` 之外全部通过，两项已写明归属；建议计划状态改为"已完成（遗落转 PK-M1-11 与 PK-M1-13，`servant` 转 PK-M1-15）"，由主会话决定。

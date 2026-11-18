# PK-M1-12 首领机制库与魔物机制字段：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：计划包行与战斗文档第 20 节归本包的 M1 行有单测；通关回归（实施 2）修了本包的两处（走不到的目标、波次首领暂停）与自动玩家打首领的方式（HEAD 就有），三条路线在原预算内到达结局（第 4 节）；第五幕首领在少数起跑 tick 上仍会循环，转 PK-M1-42；遗留见第 5 节与 `progress.md` |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-18；工作区状态（未提交，地图、NPC、客户端等并行包同时在改） |
| 审查 | 新起会话的覆盖审查一次：2 BLOCKING、16 SHOULD-FIX、若干 NIT；处理见第 3 节 |
| 遗留 | 见第 5 节与 `progress.md` |

## 1. 验收条目

测试文件 `tests/boss_mechanics.test.ts`（59 个用例）；命令 `npx vitest run --config vitest.config.ts tests/boss_mechanics.test.ts`。

| 组 | 验收 | 结果 | 证据位置（用例名） | 状态 |
| --- | --- | --- | --- | --- |
| 计划包行 | 一击致命的预警提前不少于 2 秒 | 致命档预警的结算刻减出现刻 ≥ 40 tick（2 秒）；故事难度正好 60 tick（×1.5） | "a one-shot (lethal) warning gives at least 2 seconds" | PASS |
| 预警 | 五种形状 | 圆、锥、直线、环、脉冲区的格集合按格心判定（逐格断言） | "the shapes cover the tiles" | PASS |
| 首领 | 预警档位（内容校验） | 致命档 1.9 秒、重击档 1.4 秒、其余 1.1 秒各报一条，2.0、1.5、1.2 不报；读条长于提前量时以读条为准；设计伤害高于档位的条目报错 | "content validation: leads under their tier" | PASS |
| 首领 | 预警锁定 | 预警出现后首领被移开 5 格，结算仍落在锁定格上的单位 | "locks its area" | PASS |
| 首领 | 预警不掷骰 | 区域内闪避 100% 的单位结算为 `hit`；区域外的不受伤 | "rolls nothing" | PASS |
| 首领 | 掩体 | `fromAbove` 预警对站在掩体格上的单位不结算，掩体外照打 | "cover" | PASS |
| 首领 | 首次减半 | 第一次伤害的 2 倍与第二次相差至多 1；首领重置后仍为全额 | "first half" | PASS |
| 首领 | 同屏上限 | 同一施法者满 3 个区域时第四个被拒（`warn_cap`）；一个阶段能放 4 个区域的数据报错 | "at most three areas at once" | PASS |
| 首领 | 脉冲区 | 首跳在出现后 1.2 秒，每秒一跳，到时 `expired` | "a pulse zone pulses" | PASS |
| 首领 | 阶段计时 | `atSec` 5 的阶段在第 5 秒进入，生命仍满；`untargetable` 期间选不中，过后可选中 | "阶段计时" | PASS |
| 首领 | 进入动作 | 进入阶段时施放与写旗标 | "onEnter runs its actions" | PASS |
| 首领 | 增援 | 出生光效 1.2 秒后出现；对首领仇恨表 400 的单位预置 200；首领重置时全部消散；解法与认输时一起停手 | "增援"、"adds lay down with their master" | PASS |
| 首领 | 软狂暴与难度 | 0.3 的血线：故事 21.5% 不触发、20.5% 触发，困难 35% 不触发、34% 触发；计时 10 秒：故事 12.5 秒不触发、13.5 秒触发 | "软狂暴与难度" | PASS |
| 首领 | 硬狂暴（M2 行，提前实现） | 鼠王的目标击杀时间 46.5 秒、硬狂暴 115 秒（17.4 表）；迷宫之主到点挂 `aur_st_berserk`；剧情首领不挂 | "硬狂暴" | PASS |
| 首领 | 重置 | 回家时摘下软狂暴、硬狂暴与阶段光环，常驻被动保留，战斗状态清空 | "a reset takes off the enrage" | PASS |
| 首领 | 打断窗口 | 窗口 0.5 到 1.0：进度 0.3 打断无效，0.6 打断成功；被打断的首领技能进入冷却 | "打断窗口"、"an interrupted boss cast goes on cooldown" | PASS |
| 首领 | 护盾与失衡 | 吸收盾吸收伤害；指定技能命中即破；失衡在首领免控时照常生效且不推进递减；免伤盾到时消失；免伤盾被指定技能击中即破 | "护盾与失衡"、"an immune shield"（两例） | PASS |
| 首领 | 地形 | 悬石被打破砸中首领：读条中断，失衡 3 秒，不发 `entity.died`；首领重置后悬石复原；机关是中立单位，只有首领的敌人能打，不进休息与威压 | "地形"、"arena objects are neutral" | PASS |
| 首领 | 互动与危险区 | 互动 1 秒，受击中断；用满两处时 `interact` 解法成立；危险区先出预警，1.2 秒后首跳 | "interact"、"a hazard"（两例） | PASS |
| 首领 | 点名 | 分摊点名的伤害为分散点名的一半（两人在半径内），分散点名使半径内两人各受全额 | "点名" | PASS |
| 首领 | 封场 | 开战即封，`arenaSealed` 给出首领；拴绳不生效；首领倒下即开 | "a sealed arena" | PASS |
| 首领 | 非战斗解法 | 撑过 3 秒成立 `survive`；表达式 `seal_unrest >= 10` 成立 `talk` 并写结果旗标；`resolve` 里的认输写 `yielded` 与 `resolved` | "非战斗解法"、"认输 through the library" | PASS |
| 首领 | 认输 | 守护巨鸦到 2% 停手，写 `boss.guardian_raven.resolved = yield`；悬石打破后巨鸦失衡 | "the guardian raven" | PASS |
| 首领 | 追门 | 玩家在 20 格外时首领走向 `door_mark` 持有者，3 格内开始引导（可打断、带 `channel`），每跳发 `combat.channel`；玩家进入 6 格内时打断并转回玩家；20 格内追玩家 | "追门"、"within 20 tiles" | PASS |
| 引导 | 受击推迟 | 引导受击失去剩余时间的 25% | "a hit on a channel" | PASS |
| 魔物大脑 | 看到的灵压 | 野兽不主动攻击高两阶的玩家；玩家收敛后同一只野兽主动攻击；亡灵不受影响；人形：会认输的先认输、会逃的先逃、其余照常 | "看到的灵压"（两例） | PASS |
| 注册表 | 第一幕字段 | `FIRST_ACT_FIELDS` 42 个字段，每个至少一个数据驱动用例（命中九种加击退、计时七种、反应五种、标志七种、出生四种、世界五种、窃取两种、部位与誓锁）；注册表以外的键报错；现行数据零问题 | "the registry fields act one uses" 一组 | PASS |
| 注册表 | 口径扩展 | 带 `flee` 的野兽逃跑且不呼救；人形逃跑呼 3 格内闲置同类，6 格外的不来；`social` 未写时 2 格内的同类加入、4 格外的不加入；誓锁的魔物不逃；冲锋走直线预警后落到目标身旁 | "口径扩展"、"an oath-locked monster"、"timed affixes" | PASS |
| 状态 | 澱热 | 固定种子 1,000 次施法的失控次数在 70 到 130 之间，重放一致 | "澱热" | PASS |
| 状态 | 澱病与伤病的其余效果 | 澱斑生命恢复 -10%、淬体反冲灵力恢复 -50%（修正项与实际恢复）；断肢失手握不住双手武器、武器技能被拒（`maimed`）；断肢时门授技能冷却 ×1.2 | "the taint spot"、"a maimed arm"、"the regeneration modifiers bite" | PASS |
| 状态 | 醉意（PK-M1-49 的请求） | 四层不踉跄，五层移速 ×0.85、间隔 ×1.1 | "醉意" | PASS |
| 伤病 | 来源 | 同伴倒地后被救起得轻伤；首领技能命中玩家得断肢；淬体反冲 40 次中 9 到 31 次 | "injury sources" | PASS |
| 端口 | 迷宫遗落物 | 战斗注册的端口就是迷宫读到的端口；列出遗落包（`since` 为到期减 3 日）；吞掉即离场并发 `swallowed` | "combat registers its drop bags" | PASS |
| 可读性 | 两路提示 | 内容里每个致命档与重击档预警、每个首领读条都有声音条目；去掉 `telegraph_warn` 后检查报出 | "两路提示" | PASS（运行时派发见第 5 节） |
| 数据 | 第一幕首领 | 灰羽风暴重击档首次减半；巨鸦三块悬石；晶落每名成员一个圆；二次塌方致命档 2 秒；灰雨致命档 `fromAbove`；灰潮脉冲区；巨像追门与灰壳；巨像不设硬狂暴 | "the act one bosses carry their library entries" | PASS |
| 通关回归 | 走不到的目标 | 自动玩家被拒 `unreachable` 后 4 个游戏时辰内跳过那个目标，到时再试；点名目标只剩它时仍是目标；按种类狩猎也跳过 | `tests/autoplay_reach.test.ts`（自带围墙试场） | PASS |
| 通关回归 | 波次首领暂停 | 失去目标的波次首领保留阶段与增援记号、封场打开、时钟顺延；脱战回满血后整场重置 | "a wave boss left without a foe keeps its fight"、"a paused wave boss that heals back to full" | PASS |
| 通关回归 | 首领战打法 | 有阶位的点名目标在队伍未就绪（倒地、无实体、隐身、限时削弱、八成血以下）时先等；治疗最伤的同伴（按同伴核可用性）；打断目标的可打断读条；输局里先读一次治疗、读条中不跑、200 tick 内不重试；休息时灵力五成以上用治疗回血（不放护盾、先放下目标），不足五成就等 | `tests/autoplay_party_ready.test.ts`（10 例，各分支做过变异检查） | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程都无错误 | PASS |
| 本包与相关测试 | `npx vitest run --config vitest.config.ts tests/boss_mechanics.test.ts tests/own_ability_ids.test.ts tests/combat_rules.test.ts tests/combat.test.ts` | 是 | 154 passed | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | all validators green | PASS |
| 变量注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json` current（724 个名字、128 个族） | PASS |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 finding；生成物已重生成 | PASS |
| 全量单测 | `npm test` | 是 | `Tests 7 failed / 3427 passed / 2 skipped`；七条失败都归他包或是全量并行下的超时（单独运行通过），明细见第 4 节 | PASS（本包） |
| 无模型通关 | `npm run playthrough` | 是 | 三条路线停在封门遗迹正门的落石开关（PK-M1-35）；开门后第一幕完整走通，两场首领战照常结算，明细见第 4 节 | 阻塞于他包 |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 已格式化 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 |
| --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖性审查 | 机制面广 | 修后 PASS-WITH-FOLLOWUPS | 2 | 16 | 全改：重置摘下机制光环；面向目标的预警对准施法者的目标；解法与认输时增援停手；免伤盾可被指定技能击破；机关改为中立且不放威压；首领被打断进冷却；窃贼逃跑会跑；追门唤醒走开战流程；人形看到的灵压按 12.2；内容校验补全（全部可施放技能的档位、点名的提前量与跟随、计时词缀伤害、动作引用、免伤盾的破法、表达式语法）；场外互动不开计时；危险区先预警；追门对带单位的持有者同样打断、引导冷却中回到仇恨；施放队列只等可等的拒绝；随机只在概率小于 1 时抽；`idFields` 补光环；测试加强。转后续：预警声音的客户端派发、断肢在玩家身上的两种读法（见 `progress.md`） |

## 4. 全量单测与通关

| 命令 | 结果 | 失败归属 |
| --- | --- | --- |
| `npm test` | `Test Files 7 failed / 160 passed (167)`；`Tests 7 failed / 3427 passed / 2 skipped` | `docs_guard`（PK-M1-35 的断链）、`doors_costs`（地图改版后的醒来点，提交版魔物 AI 同样复现）、`art_manifest`（基线）、`client_player_input`（客户端）；`core`、`registry`、`ailments` 三条在全量并行下超时，单独运行通过 |
| 三条路线（实施 2 后，HEAD 加本包，`$TEMP` 副本树） | `act1_minimal` 的跑法：第一幕 700,336 tick、13 级、57 死（HEAD 691,975、13 级、53 死）；`release` 2,925,086 tick 到结局、76 死（HEAD 2,244,122、55）；`rule_merca` 2,464,259 tick 到结局、76 死（HEAD 1,783,298、55）；真实的三个 `*.playthrough.test.ts` 各单独跑一次通过 | 第五幕首领战对起跑 tick 敏感（HEAD 也是），本次起跑在第五幕多 17 死；详见 `progress.md` 实施 2 |
| 开门的第一幕路线（临时探针） | 第 568421 tick 进入第二幕，13 级，20 个任务；巨鸦认输、巨像护盾升起与破碎、灰雨致命档预警、巨像倒下 | 无卡点；41 次死亡几乎都在 `borderstone_north`（地图内容与节奏） |

详细经过见 `progress.md` 第 2 节的"全量单测"与"通关结果"。

## 5. 遗留

见 `progress.md` 的"留给后续包的事项"与"越界改动与请求回写"。

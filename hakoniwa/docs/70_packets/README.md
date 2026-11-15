# 实施包目录（70_packets）

> 归属：`docs/70_packets/`（L6 实施包，制作计划线，正典优先级第 5 级）。与 `../00_vision/`、`../20_world/`、`../30_story/` 冲突时以后者为准。
> 作用：本目录的约定：包目录的命名、包内文件与模板、状态流转、与开发计划状态列和项目状态的关系、写法与并行纪律。
> 上游：[dev_process.md](../60_production/dev_process.md) 第 3 节（实施包流程）与第 6 节（四件套、写法、并行）；
> [development_plan.md](../60_production/development_plan.md) 第 1.3 节（编号、别名与状态）、第 2.2 节（交接物与验收）、第 4 节（包清单）、第 10 节（维护规则）；
> 决策 D-057（[decision_log.md](../00_vision/decision_log.md)：代码在 `hakoniwa/`，实施包在本目录，原型以功能开关在 `src/` 内实现）。
> 约束：包只按编号、节号与验收行引用设计文档与技术方案，不复制正文；包内文件名一律小写加下划线（`README.md` 除外）；禁用字符为 0，相对链接可达（文档守卫 `tests/docs_guard.test.ts`）。

## 0. 一页结论

1. **一个包一个目录。** `pk_<里程碑小写>_<两位序号>_<英文短名>/`，编号与开发计划的 `PK-` 一一对应；别名（`RE-xx`、内容批次名、素材批次名、内置 AI 步号）写在包 `README.md` 的首行（第 1 节）。
2. **三份模板覆盖小包。** [`_template/`](_template/) 的 `brief.md`、`acceptance.md`、`report.md` 依次复制为包内的 `README.md`（入口与简报）、`verification_matrix.md`（验收与证据）、`progress.md`（进度与汇报），
   正是 dev_process 第 3.2 节小包的三件；大包与三种轻量形态在此之上加文件（第 2 节）。
3. **状态四值，与计划同名。** 未开始、进行中、已完成、已取消；封包后包 `README.md` 另记"历史"。"已完成"指验收在末次改动之后全部通过，证据在包内 `verification_matrix.md`（第 3 节）。
4. **计划状态列是唯一的项目级包状态。** 包 `README.md` 的状态行、计划第 4 节的状态列、[project_state.md](../60_production/project_state.md) 的"进行中的包"三处一致；
   多个代理并行时，计划状态列、项目状态与 [progress_log.md](../60_production/progress_log.md) 由主会话统一改，实施代理只在包内回写并在汇报里写建议状态（第 4 节）。
5. **证据诚实，命令原样。** 未验证写 VERIFY 并写明缺什么；完整命令与量化结果原样记录；与本包无关的既有失败单列为基线问题（第 5 节）。

---

## 1. 目录与命名

| 对象 | 规则 | 例 |
| --- | --- | --- |
| 包目录 | `pk_<里程碑小写>_<两位序号>_<英文短名>/`；短名取包标题的要义，小写英文加下划线，2 到 4 个词 | `pk_m0_14_text_ref_kernel`、`pk_m1_29_act1_lines` |
| 编号 | 与 [development_plan.md](../60_production/development_plan.md) 第 4 节一致，只追加不复用；拆包时父包保留目录并在 `README.md` 列出子包，子包各建目录 | `PK-M0-14` 对 `pk_m0_14_*` |
| 别名 | 包 `README.md` 首行，与标题同一行写在括号里；没有别名写"无" | `# PK-M0-14 内核文本键迁移（别名：RE-13）` |
| 模板 | `_template/`：下划线开头，不是包，不登记进计划 | 见第 2.1 节 |
| 包内文件 | 一律小写加下划线，`README.md` 除外；阶段与交接文件按 dev_process 第 3.2 节命名 | `phase_02_qa.md`、`handoff_2026_11_16.md` |
| 原型 | 不设原型目录；原型在 `src/` 内以功能开关实现，开关名 `proto.<pt_编号>.<短名>`；原型包目录只放问题卡、发现与决策草稿 | dev_process 第 3.1、3.5 节 |
| 不放在本目录 | 内容暂存 `data/_staging/<内容批次名>.json`；里程碑证据台账 `docs/60_production/milestones/<里程碑>/verification_matrix.md`；项目级交接 `docs/60_production/handoffs/` | |

包目录不进 [docs/README.md](../README.md) 的索引（索引只列本文件）；包之间、包与设计文档之间用相对链接。

## 2. 包内文件

### 2.1 小包的三件（模板）

量级不超过 2 个代理人日的包只写三件，规则与验收直接引用开发计划的包行（dev_process 第 3.2 节）。

| 包内文件 | 模板 | 回答什么 | 何时写 | 生命周期 |
| --- | --- | --- | --- | --- |
| `README.md` | [`_template/brief.md`](_template/brief.md) | 这是什么包、别名、状态、目标、范围与不做、先读、文件范围、停止条件、验证命令、评审派发、交接物 | 立项 | 活文档：状态行随流转改，其余在范围变化时改 |
| `verification_matrix.md` | [`_template/acceptance.md`](_template/acceptance.md) | 凭什么说做完了：每条验收的命令或评审、结果、证据位置与状态；通用检查；审查结论；基线问题；未验证项 | 立项时列出验收条目，收官前填结果 | 交付凭证；任何修复都使之前的实跑作废，重填 |
| `progress.md` | [`_template/report.md`](_template/report.md) | 每个会话或阶段做了什么、验证结果、提交号、改动文件、自行定下的地方、遗留、风险、需用户决定 | 每个会话或阶段结束 | 只追加 |

模板字段的出处：计划第 4 节包行的列（编号、标题、工作流、范围、依赖、交付物、验收、量级、状态）；计划第 2.2 节按工作类别的交接物与接收方验收；
dev_process 第 1.3 节（结论与严重度）、第 3.3 节（各步出口标准）、第 3.6 节（停止条件）、第 4.5 节（状态标记）、第 6.3 节（进度与交接的写法）。

### 2.2 大包与轻量形态

| 形态 | 在三件之外加什么 | 依据 |
| --- | --- | --- |
| 大包（超过 2 个代理人日，或多阶段） | `brainstorm.md`、`requirements.md`、`design.md`、`implementation_plan.md`（评审派发矩阵全包唯一一份）、`phase_<nn>_<slug>.md` 与 `phase_<nn>_qa.md`、需要时 `continuation_*`、`state.md`、`handoff_<yyyy_mm_dd>.md` | dev_process 第 3.2 到 3.4 节 |
| 原型包（功能开关） | `question_card.md`、`findings.md`、`decision_draft.md` | dev_process 第 3.5 节 |
| 内容批次包 | `batch_card.md`、`batch_report.md`；`verification_matrix.md` 按 V1 到 V10 与批次验收填写 | dev_process 第 3.5 节；[release_engineering.md](../50_tech/release_engineering.md) 第 7.3 节 |
| 素材批次包 | `batch_card.md`、`review.md`；`verification_matrix.md` 记素材闸门与登记字段检查 | dev_process 第 3.5 节；[art_pipeline.md](../50_tech/art_pipeline.md) 第 15.2 节 |

大包的 `README.md` 只保留入口部分（一览、目标、从哪读起、文件清单），范围与约束写进 `requirements.md` 与阶段提示；`progress.md` 照常只追加。

## 3. 状态流转

| 步（dev_process 第 3.3 节） | 包内 | 计划第 4 节状态列 | [project_state.md](../60_production/project_state.md) | [progress_log.md](../60_production/progress_log.md) |
| --- | --- | --- | --- | --- |
| 0 立项 | 建目录、复制模板；`README.md` 状态"进行中"；验收条目列进 `verification_matrix.md` | 进行中 | 第 4 节"进行中的包"加一行 | 不记 |
| 1 到 9 侦察、设计、实施、QA、回写 | `progress.md` 每个会话追加；`verification_matrix.md` 填结果；大包改写 `state.md` | 进行中 | 不变 | 不记 |
| 10 交接（中断、换人） | 小包写进 `progress.md` 的"下一步与恢复方式"；大包写 `handoff_<yyyy_mm_dd>.md` | 不变 | 不变 | 不记 |
| 部分交付已提交 | `progress.md` 写明交付了范围栏的哪几项 | 进行中 | 对应层的"已有实现"按实况改 | 追加一行，注明"部分" |
| 11 终验与封包 | 末次改动之后的完整实跑全部 PASS；`README.md` 状态"已完成"，用户确认封包后写"历史"，并写明现状以项目状态为准 | 已完成 | 第 2 节对应层更新、第 4 节删去该行 | 追加一行 |
| 取消 | `README.md` 状态"已取消"，写砍线编号与决策编号 | 已取消（保留行） | 第 4 节删去该行 | 追加一行 |

- 状态值只用计划第 1.3 节的四个（未开始、进行中、已完成、已取消）加封包后的"历史"；包目录在立项时才建，所以包内不出现"未开始"。
- "已完成"的判定以 dev_process 第 3.6 节的"验收时序"为准：末次代码或内容变更之后的一次完整实跑通过之前，不得宣布完成。
- 封包前把遗留项转到 [roadmap.md](../60_production/roadmap.md)、[risks.md](../60_production/risks.md)、项目状态或下一个包（dev_process 第 3.7 节）。

## 4. 与开发计划状态列的关系

| 规则 | 内容 |
| --- | --- |
| 唯一来源 | 计划第 4 节的状态列是项目级唯一的包状态；包 `README.md` 的状态行与之同值（封包后包内写"历史"，计划仍为"已完成"） |
| 证据 | 计划里的"已完成"必须能追到证据：包内 `verification_matrix.md`；本目录建立之前完成的包（PK-M0-06、PK-M0-12、PK-M0-19、PK-M0-22）不补建包目录，证据是进度日志指向的提交与计划状态列的说明 |
| 谁来改 | 单个代理工作时，完成者在同一次改动里改计划状态列、项目状态并追加进度日志（dev_process 第 6.4 节结束清单）；多个代理并行时由主会话统一改，实施代理在汇报里写建议状态与依据（dev_process 第 6.6 节的请求回写） |
| 范围变化 | 设计或决策变化影响包的范围时，同一次改动里改计划的范围栏与验收栏，并在包内记录（小包写进 `progress.md`，大包写进 `state.md`）（计划第 10 节"跨包变更"） |
| 开工时建目录 | 计划新增包时不需要建目录；开工（立项）时建 |
| 编号不复用 | 取消的包保留目录与计划行；拆包时父包编号保留，子包取下一个空号 |

## 5. 写法与纪律

- **只引用，不复制。** 设计条目写文档、节号与条目编号；验收条目可以照录计划包行"验收"栏的原句，但不复制设计正文。
- **证据诚实。** 未验证写 VERIFY，并写明需要什么环境或证据；无模型的证据不冒充模型档，模拟提供方的证据不冒充真机（dev_process 第 6.3 节）。
- **命令原样。** 记录实际运行的完整命令与量化结果；不用管道拼命令链（会吞掉退出码），全量检查用 `npm run gate`。
- **只改自己的文件。** 并行时每个代理只写分配给它的文件；越界的改动写成请求回写，在 `progress.md` 与汇报里写明文件、原因与负责方。
- **提交与 git。** 实施代理不运行改变 git 状态的命令；提交只在用户要求时由主会话做，约定式提交带作用域与正文，显式路径（dev_process 第 6.6 节）。
- **审查。** 按 [reviewers/README.md](../60_production/reviewers/README.md) 的派发矩阵派审查角色；审查只读、新起会话，结论写进 `verification_matrix.md` 的审查表。
- **自查。** 写完包内文档跑文档守卫：`npx vitest run --config vitest.config.ts tests/docs_guard.test.ts`。

## 6. 来源链接

- 流程：[dev_process.md](../60_production/dev_process.md) 第 3、4.4 到 4.6、6 节；[reviewers/README.md](../60_production/reviewers/README.md)
- 计划与现状：[development_plan.md](../60_production/development_plan.md) 第 1.3、2.2、4、10 节；[project_state.md](../60_production/project_state.md)；[progress_log.md](../60_production/progress_log.md)
- 决策：[decision_log.md](../00_vision/decision_log.md) 的 D-057
- 方法论依据：[internal_playbooks.md](../10_research/woc_reuse/internal_playbooks.md) 第 3 节（实施包模板）、第 5 节（长期推进与反模式）

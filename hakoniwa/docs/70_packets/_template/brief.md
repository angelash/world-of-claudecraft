# PK-<里程碑>-<两位序号> <包标题>（别名：<RE-xx、内容批次名、素材批次名、内置 AI 步号；没有写"无">）

> 模板：复制为包目录 `pk_<里程碑小写>_<两位序号>_<英文短名>/README.md`，删去本引用块与全部尖括号说明。约定见 [70_packets/README.md](../README.md)。
> 本文是包的入口与简报：新会话只读本文、`verification_matrix.md` 与 `progress.md` 的最后一份汇报，就能开始工作（[dev_process.md](../../60_production/dev_process.md) 第 3.3 节第 6 步"自包含"）。
> 规则与验收直接引用开发计划的包行，不复制设计正文。

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-<里程碑>-<两位序号>` <包标题> |
| 状态 | 进行中、已完成、已取消、历史（计划第 1.3 节；封包后写"历史"，现状以 [project_state.md](../../60_production/project_state.md) 为准） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.<n> 节 `PK-<里程碑>-<两位序号>` |
| 形态 | 小包、大包、原型包、内容批次包、素材批次包（[70_packets/README.md](../README.md) 第 2 节） |
| 工作流 | <内核、系统、AI、客户端、渲染、编辑器、数据、内容、美术导入、音频、工具、发行、测试、文档（计划第 1.4 节）> |
| 量级 | <代理人日> 代理人日，<用户人日> 用户人日 |
| 依赖 | <包编号，逐个写明是否已完成；未完成的依赖即阻塞> |
| 别名 | <同标题行> |
| 立项日期 | <yyyy-mm-dd> |

## 1. 目标

<一句话：做完之后什么是真的。>

## 2. 范围与交付物

照录计划包行的"范围"与"交付物"两栏，拆成可勾选的条目；每条写明落点（稳定路径与导出符号，不写行号）。

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | <条目> | <`src/...`、`data/...`、`docs/...`> | <例：`release_engineering.md` 第 13.1 节> |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | <例：不改文本体系> | <例：PK-M0-14> |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、确定性内核、系统接缝、文件所有权、文本 |
| <设计文档与节号> | <本包实现的条目与验收行> |
| <代码：稳定路径与导出符号> | <要改或要接的接缝> |

## 5. 硬性约束

按本包触及的范围保留适用的行，删去其余。

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | `src/core`、`src/systems`、`src/game` 不用墙钟与非命名随机；固定 20Hz；随机走命名流 | `tests/architecture.test.ts` |
| 内核纯度 | `core`、`content`、`systems`、`ai`、`game` 不碰 DOM、Canvas、Three.js 与浏览器全局 | `tests/architecture.test.ts`、`tests/client_purity.test.ts` |
| 行为不变 | 重构类包不改变游戏结果；两条既有结局路线与确定性测试的世界哈希逐字节不变（例外只在包行明说处） | `tests/core.test.ts`、`npm run playthrough` |
| 测试先行 | 新模块配单测；修缺陷先写失败的测试 | `tests/<文件>.test.ts` |
| 文本 | 内核只发 `TextRef`；玩家可见文本用中文，代码注释与开发者文字用英文 | `implementation_conventions.md` 第 8 节 |
| 禁用字符与链接 | 文档、源码、注释、提交说明无破折号、emoji、U+2600 到 U+27BF；相对链接可达 | `tests/docs_guard.test.ts`、`npm run gate` |
| 格式 | 改过的 TS 与 JSON 用 `npm run format -- <文件>`；不格式化 markdown | `npm run gate` 的改动文件 Biome |
| 依赖 | 不新增 npm 依赖；确需时写进汇报，由用户决定 | 评审 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | <路径> |
| 本包修改 | <路径> |
| 不得修改 | <其他包正在改的文件、生成物、范围外目录> |
| 越界时 | 先确认没有别的包在动它，并在 `progress.md` 与汇报里写明文件、原因与负责方（请求回写） |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用：前置未满足、触碰底线（确定性、模型提议内核裁决 D-007、修正项 D-013、揭示台账、许可 D-015 与 D-017、密钥 D-067）、需要改正典、环境阻塞、验收时序、不可逆操作。本包特有的：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | <例：世界哈希出现差异> | <例：停下，定位差异来源，写进 progress.md 并询问> |

## 8. 验证命令

在 `hakoniwa/` 下运行，可直接复制。迭代时只跑相关文件，收尾时跑全套。

```
npx vitest run --config vitest.config.ts tests/<本包的测试>.test.ts
npm run typecheck
npm test
```

<按需加：`npm run playthrough`（触及内核、系统、内容；约 10 分钟，并行时由主会话统一跑）、`npm run build`、`npm run prompts:check`、`npm run gate`。>

## 9. 评审派发

按 [reviewers/README.md](../../60_production/reviewers/README.md) 第 4 节的派发矩阵：

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸 | 必派 | 一次贡献结束 |
| <角色> | <必派、视情况> | <触及的范围> |

## 10. 交接物

按 [development_plan.md](../../60_production/development_plan.md) 第 2.2 节本包工作类别的交接物与接收方验收填写：

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| <例：代码、测试、`verification_matrix.md`、审查报告、`progress.md`> | <用户或主会话> | <例：抽看验证矩阵；`npm run gate` 绿> |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | <事项；没有写"无"> | <选项、推荐与理由> | <阻塞、不阻塞> |

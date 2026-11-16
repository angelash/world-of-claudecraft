# PK-M0-05 生成工具能力与商用条款核实（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-05` 生成工具能力与商用条款核实 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-05` |
| 形态 | 小包 |
| 工作流 | 发行 |
| 量级 | 1 代理人日，1 用户人日 |
| 依赖 | 无 |
| 立项日期 | 2026-11-16 |

## 1. 目标

小九 AI 的图像与音频能力、商用条款、生成物权利与隐式标识都有查证过的结论，`assets/tools.json` 里有通过 `validateTools` 的登记，结论写进决策日志；PT-07 样板（PK-M0-11）可以开工。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 图像能力：画布尺寸与比例、洋红或透明底、参照图与参照强度、种子是否可见可复用、一次几张候选、能否关掉可见水印、能否直接下载 PNG | 本包 `capability_notes.md`（用户核实后由代理整理） | [assets/prompts/README.md](../../../assets/prompts/README.md) 第 3、4 节；[art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.3 节 |
| 2 | 音频能力：最长时长、能否生成可循环段、能否分轨或分离人声与伴奏、下载格式（Ogg、WAV、MP3）与采样率 | 同上 | [audio_direction.md](../../40_design/audio_direction.md) 第 12 节；PK-M0-09 的导入分支 |
| 3 | 条款快照：服务条款链接与版本、查阅日期、是否允许商业发行、生成物权利归属、署名要求、是否在文件元数据写入隐式标识及其格式 | 本包 `evidence/`（截图与页面存档） | [art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.7 节；[audio_direction.md](../../40_design/audio_direction.md) 第 12.2 节 |
| 4 | `assets/tools.json` 登记：小九 AI 图像一条、音频一条；商店图排版字体一条 | `assets/tools.json`（字段见第 12 节） | [assets/README.md](../../../assets/README.md) 第 3.2 节；`tools/assets/core/manifest.ts` 的 `ToolRecord` 与 `validateTools` |
| 5 | 决策条目：条款结论、编号约定、能力不足时的应对 | [decision_log.md](../../00_vision/decision_log.md) 第 1 节新增一条 | 计划包行的验收 |
| 6 | Steam AI 内容披露要点 | 已有草稿，不重写：[art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.7 节的申报文字；条款结论出来后只核对措辞是否仍成立 | 同左 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 生成任何入库素材 | PK-M0-11（PT-07 样板） |
| 2 | 改导入管线的字段或校验 | PK-M0-08、PK-M0-09（已完成） |
| 3 | Steam 商店页提交与 AI 披露提交 | PK-M3-03 |
| 4 | 在条款核实之前往 `assets/tools.json` 写占位记录 | 不做：`tests/art_manifest.test.ts` 对真实 `tools.json` 要求 `validateTools` 零问题，占位值（空日期、未定的商用许可）会让测试与 `npm run gate` 失败；登记只写核实过的值 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [assets/README.md](../../../assets/README.md) 第 3.2 节 | `tools.json` 的字段 |
| `tools/assets/core/manifest.ts` 的 `ToolRecord`、`validateTools` | 字段的类型与校验规则：`kind` 只能是 `image`、`audio`、`font`；`termsCheckedAt` 为 `YYYY-MM-DD`；`commercialUse` 为布尔；`id` 不可重复 |
| [assets/prompts/README.md](../../../assets/prompts/README.md) 第 3、4 节 | 生成者每张图要用到的工具能力 |
| [art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.5、6.7 节 | 登记与合规要求、Steam 申报草稿 |
| [audio_direction.md](../../40_design/audio_direction.md) 第 12 节 | 音频的登记与条款要求 |
| [risks.md](../../60_production/risks.md) RK-38 | 能力与条款不达标时的应对与砍线 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 登记只写事实 | `tools.json` 每个字段都来自用户在账户内查到的条款页或实测；查不到的项不登记该工具，写进第 11 节等用户决定 | `tests/art_manifest.test.ts` |
| 许可 | 条款不允许商用或生成物权利不清的工具，不登记为可用工具，产出不得入库 | D-015、D-018 |
| 隐式标识 | 生成服务写入的隐式标识不得删除或篡改 | [art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.7 节 |
| 禁用字符与链接 | 本包文档无破折号、emoji、U+2600 到 U+27BF；相对链接可达 | `tests/docs_guard.test.ts` |
| 格式 | 改过的 JSON 用 `npm run format -- assets/tools.json` | `npm run gate` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `docs/70_packets/pk_m0_05_tools_terms/`（本目录，含 `evidence/` 与 `capability_notes.md`） |
| 本包修改 | `assets/tools.json`；`docs/00_vision/decision_log.md`（新增一条决策）；计划状态列与 `project_state.md`（由主会话改） |
| 不得修改 | `tools/assets/`、`assets/manifest.json`、提示词库 |

## 7. 停止条件

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 条款不允许商用、权利不清，或要求的署名方式无法在游戏与商店页满足 | 停下；不登记；按 RK-38 列出替代工具选项交用户决定（提示词库与工具无关，可整体换工具） |
| 2 | 图像不支持参照图、关不掉可见水印，或只能下载有损格式 | 停下；记进 `capability_notes.md`，评估对 PT-07 首轮通过率的影响，交用户决定 |
| 3 | 条款页需要登录才能查看 | 由用户截图；代理不代为登录、不接触账户凭据 |

## 8. 验证命令

在 `hakoniwa/` 下运行。

```
npx vitest run --config vitest.config.ts tests/art_manifest.test.ts tests/audio_import.test.ts
npm run assets:check
npx vitest run --config vitest.config.ts tests/docs_guard.test.ts
npm run gate
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸 | 必派 | 一次贡献结束 |
| 素材合规 | 必派 | 生成工具条款与 `tools.json`（[reviewers/README.md](../../60_production/reviewers/README.md) 第 2.6 节） |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 条款截图与查阅记录、能力实测结果 | 用户交代理 | 代理整理进 `evidence/` 与 `capability_notes.md` |
| `assets/tools.json` 登记、决策条目、`verification_matrix.md` | 代理交用户 | 用户抽看登记与决策；`npm run gate` 绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 在小九 AI 账户里查条款并实测能力（第 12 节清单） | 用户操作；把截图放进本包 `evidence/`，或直接把结论贴给代理 | 阻塞 |
| 2 | 商店图排版用的标题字体 | 选一款明确允许商用（含商标与宣传用途）的字体；推荐 SIL OFL 授权的开源字体，授权清楚、无须付费；最迟在 PK-M3-03 之前定 | 不阻塞 PT-07；阻塞本包的"排版字体"登记，可拆到 PK-M3-03 |

## 12. 用户核实清单与登记格式

### 12.1 在小九 AI 里要查的

| 序 | 项 | 记什么 |
| --- | --- | --- |
| 1 | 服务条款与用户协议的链接、版本或生效日期 | 链接、日期；整页截图 |
| 2 | 生成内容能否用于商业发行（游戏销售、商店页、宣传） | 是或否；原文摘录 |
| 3 | 生成内容的权利归属（归用户、归平台、平台保留使用权等） | 原文摘录 |
| 4 | 是否有署名或标注要求 | 原文摘录；没有写"无" |
| 5 | 下载的文件元数据里是否有隐式标识（服务提供者编码、内容编号） | 有或无；有则记字段名与一个样例值（用任一测试图的元数据） |
| 6 | 图像：可选画布尺寸与比例、透明或纯色底、参照图、种子、每次候选张数、可见水印能否关闭、下载格式 | 逐项是或否与取值 |
| 7 | 音频：最长时长、可循环、分轨或人声分离、下载格式与采样率 | 逐项取值 |
| 8 | 使用的模型名与版本（界面上可见的） | 名称与版本，写进 `usedVersions` |
| 9 | 账户限额（每日次数、并发） | 取值；用于重估 PT-07 与 M1 的生成工时 |

### 12.2 登记格式

小九 AI 的图像与音频各一条（`kind` 只能取一个值，`id` 不可重复）：图像沿用美术方案里的编号 `xiaojiu`，音频用 `xiaojiu_audio`。两条共用条款字段。尖括号里的值在核实后替换，替换前不写进 `assets/tools.json`。

```json
[
  {
    "id": "xiaojiu",
    "name": "小九 AI",
    "kind": "image",
    "usedVersions": ["<界面可见的图像模型名与版本>"],
    "termsUrl": "<服务条款链接>",
    "termsCheckedAt": "<YYYY-MM-DD>",
    "commercialUse": true,
    "outputRights": "<条款原文摘录与链接>",
    "aigcLabel": "<写入隐式标识时：字段名与格式；不写入时：none>"
  },
  {
    "id": "xiaojiu_audio",
    "name": "小九 AI",
    "kind": "audio",
    "usedVersions": ["<界面可见的音频模型名与版本>"],
    "termsUrl": "<同上>",
    "termsCheckedAt": "<同上>",
    "commercialUse": true,
    "outputRights": "<同上>",
    "aigcLabel": "<同上>"
  }
]
```

排版字体选定后加一条 `kind` 为 `font` 的记录：`termsUrl` 写授权链接，`outputRights` 写授权类型与商用条款摘录，`aigcLabel` 写 `none`。

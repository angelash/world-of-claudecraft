# PK-M1-41 音频 M1（别名：音频批次 `audio_m1_provisional_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-41` 音频 M1 |
| 状态 | 进行中（本轮把候选池接进游戏：暂定采用、导入、开发版加载；主审试听与通过、分轨模块、M1 验收仍待做，见 `progress.md` 第 3、4 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-41` |
| 形态 | 素材批次包，按小包三件写（本轮的范围是采用与接线，不是成品验收） |
| 工作流 | 音频 |
| 量级 | 3 代理人日，11 用户人日 |
| 依赖 | PK-M0-09（已完成：导入分支）；PK-M1-06（已完成：音频引擎）；PK-M0-34（审核台与 `tools/assets/review/` 的采用代码，进行中，本轮只调用不修改） |
| 别名 | 音频批次 `audio_m1_provisional_01`（本轮的暂定采用） |
| 立项日期 | 2026-11-18 |

## 1. 目标

序章与第一幕会触发的全部音频（地图的音乐与环境、`data/audio/cues.json` 的音效、导演与过场用到的乐句），以及其余 M1 条目，都从候选池按一条写明的规则各挑一版，经素材审核台自己的采用代码落成原文件、登记为 `review` 并导入；开发版（`npm run dev`）加载 `review` 状态，进游戏就能听到。主审试听后再定通过、返工或淘汰。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 暂定采用：序章与第一幕地图的音乐与环境声（38 个编号）、事件表与导演会触发的编号、其余 M1 条目；规则 R1 与 R2（第 2.1 节）；经 `tools/assets/review/store.ts` 的 `adopt` 采用（Ogg q8、AIGC 注释、`review` 记录、`review_log.jsonl` 一行），备注写明"暂定、未试听" | `assets/audio/<outDir>/`、`assets/manifest.json`、`assets/review_log.jsonl` | [assets/README.md](../../../assets/README.md) 第 3.4 节；[audio_direction.md](../../40_design/audio_direction.md) 第 11.1、11.5 节 |
| 2 | 导入与校验：`npm run assets:import`、`npm run assets:check` | `assets/processed/audio/` | 音频方向第 8、9、11.2 到 11.4 节 |
| 3 | 开发版加载 `review` 状态（美术与音频共用一个开关，`?assets=approved` 关掉）；发布版不变 | `src/client/assets/types.ts` 的 `loadedStatuses`；`src/client/audio/audio_manifest.ts`、`audio_loader.ts`、`browser_audio.ts`（美术一侧见 PK-M0-11 包） | 素材说明第 4 节；发行工程第 9 节 |
| 4 | 工具登记：`stable_audio_3_small_sfx` 的 `commercialUse` 改为 `true`（用户 2026-11-18 确认已办社区许可） | `assets/tools.json` | 素材说明第 3.2 节 |
| 5 | 问题清单（早期发现，修复在后） | `progress.md` 第 3 节 | 本包 |
| 6 | 测试：开关的单测 | `tests/audio_engine.test.ts`、`tests/client_assets.test.ts` | 本包 |

### 2.1 挑选规则（确定、可重放）

规则只读 `candidates.json` 里记录的测量值，不试听；挑出的每一条都在清单备注与审核记录里写明是暂定。

| 规则 | 内容 |
| --- | --- |
| R1 | 按候选池顺序（`candidates.json` 的顺序）读候选；一条候选合格的条件：生成工具在 `assets/tools.json` 里 `commercialUse` 为 `true`；有存在的主文件；记录了 `metrics.lufs` 时与模板目标相差不超过 1 LU；记录了 `metrics.truePeak` 时不高于模板上限（目标与上限取 `tools/assets/core/audio/plan.ts` 的 `audioPlanOf`）。`single` 取第一条合格的；`sequence` 按顺序取前 `adoptCount` 条合格的 |
| R2 | 没有足够的合格候选时（生成时的响度归一没压到目标，或真峰值超上限 0.01 dB 这类测量舍入），在工具已登记、主文件存在的候选里取记录响度离目标最近的（同距按候选池顺序）；导入会重新归一 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 试听与通过、返工、淘汰的决定 | 主审（用户），在素材审核台 |
| 2 | 分轨（stems）模块重新落地并接入导入管线；多层曲目暂按单层导入 | 本包后续轮次，与 `tools/assets/` 的所有方协调 |
| 3 | 修改 `tools/assets/`、`tools/audio_gen/`、`src/editor/assets/`、`tools/dev_api.ts` | 另一会话正在改这些目录；本轮遇到的工具问题写进问题清单 |
| 4 | 新的生成调用、删除候选 | 不做 |
| 5 | M2、M3 条目（除第一幕会触发的 `mus_cmb_tide`、`sfx_door_seal_mid`、`sfx_god_moira_page`） | PK-M2-33、PK-M3-32 |
| 6 | 提交与 Git LFS | 用户决定（体积见 `verification_matrix.md`） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [assets/README.md](../../../assets/README.md) 第 3.3、3.4、4 节 | 状态流转、候选池、采用、导入命令 |
| [audio_direction.md](../../40_design/audio_direction.md) 第 8、9、11、13 节 | 响度、格式、工作流、批次 |
| `tools/assets/review/store.ts` 的 `adopt` | 采用的唯一入口 |
| `src/client/audio/audio_loader.ts`、`src/client/assets/types.ts` 的 `loadedStatuses` | 开发版加载 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 只经审核台采用 | 不手工复制原文件，不手改 `manifest.json`；采用、登记、导入都走既有代码与命令 | `assets:check`；`review_log.jsonl` |
| 状态 | 记录停在 `review`（导入或校验自动改成 `rework` 的除外）；只有主审能改成 `approved` | `tests/art_manifest.test.ts` 的清单校验 |
| 发布版 | 发布版只认 `approved`：两个加载器只在 `import.meta.env.DEV` 时运行，默认状态都是 `approved`；发布扫描规则不变 | `tests/client_assets.test.ts`、`tests/audio_engine.test.ts`（开关的取值与默认）；发布包不含加载器本身没有专门的测试，见 `progress.md` 第 4 节 |
| 禁用字符 | 文档、源码、清单备注无破折号、emoji、U+2600 到 U+27BF | `tests/docs_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `assets/audio/**`（采用的原文件）、`assets/processed/audio/**`、`assets/review_log.jsonl`；本目录 |
| 本包修改 | `assets/manifest.json`（经采用代码与导入命令）、`assets/tools.json`、`assets/README.md` 第 4 节一条；`src/client/assets/types.ts`、`src/client/audio/audio_manifest.ts`、`audio_loader.ts`、`browser_audio.ts`；`tests/audio_engine.test.ts`、`tests/client_assets.test.ts` |
| 不得修改 | 第 3 节第 3 行的目录；`src/client/assets/runtime.ts`（PK-M1-24 的文件）；其他包的数据目录 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。许可边界（D-015、D-017）：生成工具未登记商用许可时不采用；本轮的许可由用户在 2026-11-18 确认。

## 8. 验证命令

```
node ../node_modules/tsx/dist/cli.mjs <采用脚本> <hakoniwa> <输出目录> <编号清单>   # 规则见第 2.1 节，脚本只调用 store.adopt
npm run assets:register
npm run assets:import
npm run assets:check
npm run typecheck
npx vitest run --config vitest.config.ts tests/audio_engine.test.ts tests/client_assets.test.ts tests/art_manifest.test.ts tests/asset_review.test.ts tests/audio_import.test.ts tests/release_bundle.test.ts tests/docs_guard.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束：改动与问题清单的覆盖 |

## 10. 需用户决定

见 `progress.md` 第 4 节。

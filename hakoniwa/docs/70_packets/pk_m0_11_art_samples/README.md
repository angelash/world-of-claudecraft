# PK-M0-11 PT-07 AI 素材样板（别名：美术批次 `art_m1_first_delivery_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-11` PT-07 AI 素材样板 |
| 状态 | 进行中（本轮把本机美术执行器已交付的原图登记、导入、校验并接进开发版；HD-2D 评审、主审通过、单位成本与通过率的决策条目仍待做，见 `progress.md` 第 3、4 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-11` |
| 形态 | 素材批次包，按小包三件写 |
| 工作流 | 美术导入 |
| 量级 | 3 代理人日，4 用户人日 |
| 依赖 | PK-M0-05（工具登记：用户 2026-11-18 确认小九 AI 条款，链接与原文摘录待补）；PK-M0-08、PK-M0-10（已完成）；PK-M0-07（进行中）；PK-M0-34（审核台，进行中） |
| 别名 | 美术批次 `art_m1_first_delivery_01`（本机执行器第一章的首批交付） |
| 立项日期 | 2026-11-18 |

## 1. 目标

`assets/art/` 下已交付的原图全部有清单记录（`review`）、有当前导入版本的处理结果，联系表读过并把问题记进清单；开发版（`npm run dev`）加载 `review` 状态，进游戏就能看到已经有消费方的图（远景天幕、剧情插画、生灵动作表与头像）；开发图集用 `--include-review` 打得出来。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 工具登记：小九 AI 图像一条（`xiaojiu`，`usedVersions` 取执行器运行记录里的模型名 `gpt-image-2`；条款链接与原文摘录未记，写明待补） | `assets/tools.json` | [assets/README.md](../../../assets/README.md) 第 3.2 节；[PK-M0-05](../pk_m0_05_tools_terms/README.md) 第 12.2 节 |
| 2 | 登记：`npm run assets:register -- --tool xiaojiu --tool-version gpt-image-2 --lang en --converted ...` | `assets/manifest.json` | 素材说明第 3.1 节 |
| 3 | 导入与联系表：`npm run assets:import`（美术编号加 `--all`，联系表覆盖全部） | `assets/processed/<类>/`；`.local/contact/` | [art_pipeline.md](../../50_tech/art_pipeline.md) 第 13 节 |
| 4 | 校验与开发图集：`npm run assets:check`；`npm run assets:atlas -- --include-review` | `.local/atlas/` | 素材说明第 4.1 节 |
| 5 | 开发版加载 `review` 状态（与音频共用一个开关） | `src/client/assets/types.ts` 的 `loadedStatuses`；`resolver.ts` 的 `AssetSource.statuses`；`loader.ts` | 素材说明第 4 节；美术方案第 6.4 节 |
| 6 | 问题清单（早期发现，修复在后） | `progress.md` 第 3 节 | 本包 |
| 7 | PT-07 的 3 条音频样板（`mus_town_borderstone_day`、`amb_town_day`、`sfx_hit_slash_flesh`） | 随 PK-M1-41 采用；前两条导入报循环接缝、在 `rework`（PK-M1-41 问题清单 B1） | 计划包行 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 生成与重画；本机美术执行器（`.local/art_generation/`）的任何改动 | 用户的执行器 |
| 2 | 主审通过与原因码决定 | 主审，在素材审核台 |
| 3 | 修改 `tools/assets/`、`src/editor/assets/`、`tools/dev_api.ts` | 另一会话正在改这些目录 |
| 4 | 新的消费方（图标、地块、建筑、道具、特效、界面九宫格的绘制） | PK-M1-04（图集）、PK-M1-24（HD-2D）、界面各包 |
| 5 | 单位成本、首轮通过率的决策条目；M1 用户人日重估 | 本包后续轮次（需要主审的审核耗时） |
| 6 | 提交与 Git LFS | 用户决定（体积见 `verification_matrix.md`） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [assets/README.md](../../../assets/README.md) 第 3、4 节 | 登记、导入、校验、图集 |
| [art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.4、13、15 节 | 解析器、导入步骤、原因码 |
| `src/client/assets/loader.ts`、`resolver.ts`、`types.ts` 的 `loadedStatuses` | 开发版加载 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 只经命令登记 | 不手改 `manifest.json`，不手工移动原图；登记、导入、校验、图集都走既有命令 | `assets:check`；`tests/art_manifest.test.ts` |
| 状态 | 记录停在 `review`（导入或校验自动改成 `rework` 的除外）；只有主审能改成 `approved` | 同上 |
| 发布版 | 发布版只认 `approved`：美术加载器只在 `import.meta.env.DEV` 时运行，默认状态是 `approved`；发布扫描规则不变 | `tests/client_assets.test.ts` |
| 禁用字符 | 文档、源码、清单备注无破折号、emoji、U+2600 到 U+27BF | `tests/docs_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | 本目录 |
| 本包修改 | `assets/manifest.json`（经登记与导入命令）、`assets/processed/**`（经导入命令）、`assets/tools.json`；`src/client/assets/types.ts`、`resolver.ts`、`loader.ts`；`tests/client_assets.test.ts` |
| 不得修改 | 第 3 节第 1、3 行；`src/client/assets/runtime.ts`（PK-M1-24 的文件） |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npm run assets:register -- --tool xiaojiu --tool-version gpt-image-2 --lang en --converted --date <日期> --notes "<来源说明>"
npm run assets:import -- --all --id <美术编号>
npm run assets:check
npm run assets:atlas -- --include-review
npm run typecheck
npx vitest run --config vitest.config.ts tests/client_assets.test.ts tests/art_manifest.test.ts tests/release_bundle.test.ts tests/docs_guard.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 与 PK-M1-41 同一次复查 |

## 10. 需用户决定

见 `progress.md` 第 4 节。

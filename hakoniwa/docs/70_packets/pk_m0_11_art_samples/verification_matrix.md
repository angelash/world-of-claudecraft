# PK-M0-11 PT-07 AI 素材样板：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PARTIAL（本轮目标"已交付的原图全部登记、导入、校验并接进开发版"已达到；计划包行的验收"美术方案第 15.4 节 M0 闸门全部项通过；单位成本与通过率写进决策日志"未做，需要主审） |
| 末次改动 | 未提交；工作区状态 |
| 完整实跑 | 2026-11-18 |
| 审查 | 与 PK-M1-41 同一次覆盖性复查，见那份矩阵第 5 节 |
| 建议状态 | 计划状态列改为"进行中" |

## 1. 验收条目

| 序 | 条目 | 命令与结果 | 状态 |
| --- | --- | --- | --- |
| 1 | 原图全部有记录 | 四次 `npm run assets:register`（原样命令见 `progress.md`）：190、13、11、3 张，`0 refused`；工作期间执行器陆续交付，最终 217 张原图、217 条美术记录 | PASS |
| 2 | 文件名对得上提示词条目 | 登记前用 `matchFile` 逐个核对，没有拒收 | PASS |
| 3 | 导入与联系表 | 末次 `npm run assets:import -- --all --id <全部美术编号>`：`217 processed, 0 up to date, 0 with problems`；联系表 8 页在 `../.local/contact/` | PASS |
| 4 | 校验 | 末次 `npm run assets:check`：美术 0 条过时；1 条 `rework`（A15）；其余为提示 | 部分 |
| 5 | 开发图集 | `npm run assets:atlas -- --include-review`：`148 asset(s) packed into 10 page(s)` | PASS |
| 6 | 开发版加载 `review` 美术，发布版不变 | 开发服务里安装的解析器有 148 个可画编号，全部为 `review`，参照三视图不画；远景天幕两层解析并解码；`?assets=approved` 时为 0 | PASS |
| 7 | 单测与类型检查 | 见 PK-M1-41 矩阵第 1 节第 6、7 行 | PASS |
| 8 | 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts tests/art_manifest.test.ts`：`Test Files 2 passed (2)`，`Tests 30 passed (30)`；本包文件的禁用字符扫描为 0 | PASS |
| 9 | 美术方案第 15.4 节 M0 闸门、单位成本、首轮通过率 | 未做 | VERIFY（主审） |

## 2. 体积

| 路径 | 文件数 | 体积 | 去处 |
| --- | --- | --- | --- |
| `assets/art/**`（原图） | 217 | 156.1 MB | Git LFS 路径；留在本机，等单独的素材仓库 |
| `assets/processed/` 下的美术（PNG 加 JSON） | 384（参照三视图只有 JSON） | 7.1 MB | 普通文件，现在就可以提交 |

## 3. 现在就可以提交的非 LFS 文件（本通道的）

| 文件 | 体积 |
| --- | --- |
| `assets/manifest.json` | 1.1 MB（946 条） |
| `assets/tools.json` | 2.9 KB |
| `assets/review_log.jsonl` | 0.4 MB（755 行） |
| `assets/README.md` | 23 KB（本通道只改第 4 节一条） |
| `assets/processed/<美术各类>/` | 7.1 MB |
| `src/client/assets/types.ts`、`resolver.ts`、`loader.ts`；`src/client/audio/audio_manifest.ts`、`audio_loader.ts`、`browser_audio.ts`、`README.md`；`tests/client_assets.test.ts`、`tests/audio_engine.test.ts` | 代码改动，见 `progress.md` |
| 两个包目录 | 文档 |

处理结果的导入版本 `1.0.16` 来自 `tools/assets/core/meta.ts` 尚未提交的改动。处理结果要和那份工具改动一起提交（PK-M1-41 问题清单 B12）。

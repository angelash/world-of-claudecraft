# PK-M0-05 生成工具能力与商用条款核实：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | 未完成：条款与能力待用户在小九 AI 账户内核实 |
| 末次代码或内容变更 | 无（本包只建了包目录） |
| 完整实跑 | 未跑 |
| 审查 | 未派 |
| 遗留 | 见第 5 节 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 登记字段齐全 | `npx vitest run --config vitest.config.ts tests/art_manifest.test.ts`；`npm run assets:check` | 待登记 | | VERIFY |
| 2 | 条款允许商用（不允许时启用替代工具） | 素材合规审查；`evidence/` 的条款截图 | 待用户核实 | `evidence/` | VERIFY |
| 3 | 结论写进决策日志 | 人工核对 [decision_log.md](../../00_vision/decision_log.md) 第 1 节 | 待写 | | VERIFY |
| 4 | 图像与音频能力有实测结论 | 人工核对 `capability_notes.md` | 待用户实测 | `capability_notes.md` | VERIFY |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | | |
| 改动文件格式 | `npm run format -- assets/tools.json` | 是 | | |
| 全量本地门 | `npm run gate` | 是 | | |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 总闸 | 一次贡献结束 | | | | | |
| 素材合规 | 生成工具条款 | | | | | |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts tests/art_manifest.test.ts` | `the committed manifest > manifest.json and tools.json are valid and match the files under art/ and audio/ both ways`：`unregistered` 列出 `assets/art/` 下 30 个未登记的 PNG | 这些原图在本包开工前已在工作区（未跟踪，2026-11-16 生成），本包没有改 `assets/art/` 与 `assets/manifest.json`；`tools.json` 仍为 `[]`，`validateTools` 无问题 | 原图的登记要先有本包的工具登记，随后由 PK-M0-11 登记与导入 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 1 到 4 | 小九 AI 账户内的条款页与实测 | 用户，PT-07（PK-M0-11）开工前 |

# PK-M1-06 音频引擎：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（引擎与数据在无素材条件下全部验证；依赖真实音频文件与真机的条目标 VERIFY，随 PK-M1-41 与参考机补） |
| 末次代码或内容变更 | 未提交；改动文件清单见 [progress.md](progress.md) 第 2 节 |
| 完整实跑 | 2026-11-17；工作区未提交状态；末次改动是设置页登记、`tests/client_settings_shell.test.ts` 的音频默认值断言与滑块拖到 0 时显示静音，之后重跑了下表命令 |
| 审查 | 新起会话的审查一次（找出 3 条阻塞与若干应修项，均已修并补回归测试）；之后只有设置页登记一处小改动，未再单独审查 |
| 遗留 | 见 [progress.md](progress.md) 第 2 节"留给后续包的事项" |

## 1. 验收条目

计划包行的验收：音频第 10.6 节 M1 验收；纯逻辑单测；无音频设备时静默运行。

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 10.6 纯逻辑单测：取曲优先级、战斗滞回、紧张度、抢占与节流、声像计算、清单校验 | `npx vitest run tests/audio_engine.test.ts tests/audio_world.test.ts tests/audio_stems.test.ts tests/audio_import.test.ts` | 导演、播放、环境、声部池、空间化、清单、字幕、震动、命中选择、世界探针均有用例；`audio_engine` 54、`audio_world` 13、`audio_stems` 6 通过 | 同左 | PASS |
| 2 | 10.6 内容校验：每张地图登记的音乐与环境编号存在 | `tests/world_atlas.test.ts`；`node tools/content/validate.ts` | `atlasAudioProblems` 在测试里带声音编号集合校验；内容校验全绿 | `src/systems/world/atlas.ts` | PASS |
| 3 | 10.6 内容校验：每个循环音频有循环点；响度与真峰值在 8.1 范围内；本文、提示词库与素材清单编号三方一致 | `npm run assets:check`（需入库音频） | 导入分支的校验已有（PK-M0-09），分轨层的对齐长度与层数校验已加；仓库内尚无真实音频文件可校验 | `tests/audio_stems.test.ts` | VERIFY |
| 4 | 10.6 声音巡游：每张地图昼夜各 1 分钟、每级战斗一次、每位女神一次 | 人工巡游 | 无素材，无法听 | | VERIFY |
| 5 | 10.6 M1：序章与第一幕没有缺失的音频，没有可听的循环接缝 | 人工，素材入库后 | 取决于 PK-M1-41；引擎侧：缺失即静默，不出占位声 | `tests/audio_engine.test.ts` | VERIFY |
| 6 | 10.6 M1：无模型档与模型档的对话体验同样完整 | `tests/audio_engine.test.ts`（模型等待音可关，对话闪避与模型状态无关） | 两档走同一条触发路径；真实对话听感待 PK-M1-22 接入后评审 | | VERIFY |
| 7 | 无音频设备时静默运行 | 单测（无设备引擎只产出操作）；浏览器冒烟 | 单测通过；浏览器：游戏在 `divine_court` 起，AudioContext 为 running，无音频文件时控制台无错误 | `progress.md` 冒烟记录 | PASS |
| 8 | 序章"偷听"一拍有按距离的音量三档 | `tests/audio_engine.test.ts`（`listenTierOf`、`quieterTier`） | far、mid、near 三档与"取更安静一档"规则通过 | | PASS |
| 9 | 设置与无障碍：字幕、减少突发巨响、减少闪烁与震动、手柄震动表 | `audio_engine` 用例；`tests/settings_store.test.ts`；`tests/client_settings_shell.test.ts` | 设置块校验与迁移、字幕行板、震动表、设置页默认值均通过；完整的无障碍页画面归 PK-M1-23 | | PASS |
| 10 | 命中音效选择字段（战斗与职业 8.3） | `audio_engine` 用例 | `selectHit` 与 `validateSelectionTable` 通过 | `data/audio/selection.json` | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 退出码 0 | PASS |
| 本包与相关套件 | `npx vitest run tests/client_settings_shell.test.ts tests/audio_engine.test.ts tests/audio_world.test.ts tests/audio_stems.test.ts tests/audio_import.test.ts tests/client_purity.test.ts tests/settings_store.test.ts tests/desktop_settings.test.ts tests/world_atlas.test.ts` | 是 | 9 文件 353 用例通过 | PASS |
| 客户端、设置、界面文本、文档守卫与音频 | `npx vitest run tests/client_ tests/settings_ tests/i18n_ui_ tests/docs_guard tests/audio_ tests/world_atlas.test.ts tests/desktop_settings.test.ts` | 是 | 39 文件 863 用例通过 | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿 | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 是 | 0 finding | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 无错误，只有既有的非空断言警告 | PASS |
| 构建 | `npm run build` | 是 | 退出码 0 | PASS |
| 默认套件、无模型通关、全量本地门 | `npm test`、`npm run playthrough`、`npm run gate` | 是 | 未整套运行：同工作区有其他包的在途改动，整套结果不能归因于本包 | VERIFY |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的差异审查 | 一次贡献结束 | 修后通过 | 3（敌人倒下误播胜利、首领曲不等吼声、首领层错一位） | 数条（昼夜切换间隔、字幕板长度、仇恨方向、声部上限等） | 全部已修并加回归测试 | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run tests/art_manifest.test.ts` | 用户未入库美术导致清单不符 | 开工前同样失败，文件不在本包范围 | 用户美术入库 |
| `tests/disputes.test.ts` | 曾有语法错误并使 `npm run typecheck` 失败 | 属 PK-M1-46；末次实跑时类型检查已通过 | PK-M1-46 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 3、4、5 | 真实音频文件与人耳 | PK-M1-41 入库后做声音巡游 |
| 6 | 对话与过场接入后的真实听感 | PK-M1-22 之后 |
| 7 | 真机输出设备与手柄震动 | 参考机上的用户 |
| 2 的发行构建 | 发行构建的加载器只在开发模式启用，打包步骤缺失 | 见遗留，建议并入发行音频打包工作 |

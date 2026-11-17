# PK-M1-06 音频引擎：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1、审查 1、修复 1 | 音频子系统各模块、数据表、图集字段、设置与设置页、会话接线、导入分支分轨模块、文档回写；新起会话审查后修 3 条阻塞与应修项 | 未提交 | 客户端、设置、界面文本、文档守卫与音频 39 文件 863 用例通过；`npm run typecheck` 0；`node tools/i18n/check.ts` 0 finding；`node tools/content/validate.ts` 全绿；`npm run build` 0；浏览器冒烟通过 | 1. 主会话提交；2. 遗留各项转去对应包 |

## 2. 汇报

### 2026-11-17 实施 1、审查 1、修复 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/client/audio/ambience_mixer.ts`、`audio_engine.ts`、`audio_manifest.ts`、`audio_settings.ts`、`audio_world.ts`、`captions.ts`、`hit_select.ts`、`music_player.ts`、`rumble.ts`、`sound_player.ts`、`spatializer.ts` | 新增 | 纯核心（登记于 `CLIENT_PURE_CORES`） |
| `src/client/audio/audio_bus.ts`、`audio_loader.ts`、`browser_audio.ts`、`caption_painter.ts`、`haptics.ts`、`README.md` | 新增 | Web Audio 薄层、开发构建加载器、浏览器接线、字幕画手、手柄震动输出、本地说明 |
| `src/client/audio/audio_director.ts`、`bus_model.ts`、`cue_map.ts`、`index.ts` | 修改 | 天气、首领层、过场层数、胜利与时间跳过、昼夜间隔；雨与暴风闪避、主链；短乐句类别与巨响；桶与 `createGameAudio` |
| `src/client/windows/settings/audio_model.ts`、`audio_page.ts` | 新增 | `ui_set_audio` 模型与画手 |
| `src/client/windows/settings_window.ts`、`src/client/windows/settings/shell_model.ts` | 修改（共享） | 登记音频页画手；"恢复本页默认"覆盖音频页 |
| `src/client/app/settings_schema.ts` | 修改 | 同步部分 `audio` 选项块，本地部分 `audioDevice` |
| `src/client/app/session.ts` | 修改（共享） | 末尾一个分隔的音频块与三处调用 |
| `src/systems/world/atlas.ts`、`src/content/packs/world.ts` | 修改 | 图集音频字段、`REVERB_ZONES`、`atlasAudioProblems`；编辑器字段 |
| `data/world/atlas_maps.json` | 修改 | 22 张地图登记音频 |
| `data/audio/cues.json` | 修改 | 新事件与字段（`client.*` 事件域、巨响、短乐句类别）；未改技能编号 |
| `data/audio/ambience.json`、`data/audio/selection.json` | 新增 | 环境层表；命中选择表 |
| `locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts` | 修改 | `ui.ovl.caption.*` 与 `ui.set.audio.*`；键类型经 `node tools/i18n/gen_keys.ts` 重生成 |
| `tools/assets/core/audio/stems.ts` | 新增 | 分轨文件夹的识别与在混音上的统一处理 |
| `tools/assets/core/audio/meta.ts`、`process.ts` | 修改 | 层文件数与等长校验；单层说明 |
| `tests/audio_engine.test.ts`、`audio_world.test.ts`、`audio_stems.test.ts` | 新增 | 54、13、6 个用例 |
| `tests/audio_import.test.ts`、`world_atlas.test.ts`、`settings_store.test.ts`、`desktop_settings.test.ts`、`client_purity.test.ts`、`client_settings_shell.test.ts` | 修改 | 夹具与新字段；纯核心登记；音频页默认值 |
| `docs/40_design/audio_direction.md` | 修改 | 回写：文本键、图集字段表、室内、选择字段来源、封印步、客户端触发、距离公式、字幕行为、震动触发、分轨文件夹、模块表 |
| `docs/70_packets/pk_m1_06_audio_engine/` | 新增 | 本包三件 |

**验收逐条结果**

见 [verification_matrix.md](verification_matrix.md) 第 1 节：1、2、7、8、9、10 为 PASS；3、4、5、6 为 VERIFY（需要真实音频文件、人耳或接入后的对话与过场）。

浏览器冒烟（开发服务器 5180，验证后已停）：游戏在 `divine_court` 起，AudioContext 为 running，`WebAudioBus` 建图与总线增益被调用，没有任何音频文件时控制台无错误。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 音频方向第 10.4 节 | 字幕键 `audio.cap.<编号>` | 设计键保留为数据里的 `caption`，界面文字键用 `ui.ovl.caption.<编号>` 与方向 `ui.ovl.caption.dir.<方向>` | `ui.audio.*` 不是界面守卫允许的类别 | 否（已回写） |
| 音频方向第 7 节 | 客户端自发的提示音没有事件名 | 用 `client.*` 事件域（`client.llm_waiting`、`client.llm_reply`、`client.llm_error`、`client.threat_offscreen`） | 避免被文本检查当成文本键 | 否（已回写） |
| 音频方向第 5.1 节 | 每张地图登记音乐与环境 | 必须登记的是已建地图与第 0、1 幕地图，战场地图豁免 | 未建地图还没有曲目 | 否 |
| 音频方向第 5.2、5.3 节 | 首领被击败播胜利乐句 | 胜利只来自 `combat.boss_defeated` 事件或首领实体倒下；首领离开地图、或 8 秒没有交战，算作结束而不播胜利（团灭不播）；已击败的首领不会再次开启首领曲 | 内核没有"首领战结束"事件 | 否 |
| 音频方向第 11.3 节 | 分轨导入 | 分轨在混音上统一处理（同一裁切、增益与限幅曲线）后再拆层输出 `_s1.._sN` | 保证各层对齐与响度一致 | 否（已回写） |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/client/windows/settings_window.ts`、`settings/shell_model.ts`、`tests/client_settings_shell.test.ts` | 音频页按 `PAGE_OWNERS` 归本包，需要登记画手与默认值 | PK-M1-22 | 已改：各一处小改动 |
| `src/client/app/session.ts` | 音频接线 | PK-M1-22 也改客户端接线 | 已改：一个分隔块 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 辅助功能页（字幕开关与样式、减少闪烁的画面实现）；字幕画手的样式与位置 | PK-M1-23 |
| 过场、对话、神谕、梦境、序章偷听调用 `GameAudio`（`setCutscene`、`playSound`、`playStinger`、`setDivine`、`setDream`、`setListenTier`、`modelWait`、`rumble`） | PK-M1-22 |
| 把 `tools/assets/core/audio/stems.ts` 接入 `tools/assets/import.ts`（挂点：音频分支遇到 `<id>.stems/` 文件夹时调用分轨处理） | 导入管线的所有方，或 PK-M1-41 开工前的导入小包 |
| 发行构建的音频打包：加载器只在开发构建启用，发行构建目前静默 | 发行音频打包工作（建议随 PK-M1-41 或发行工程包） |
| 726 条素材、声音巡游、循环接缝与响度校验 | PK-M1-41 |
| 输出设备选择（`audioDevice` 已在设置里，画面未做） | PK-M1-57 或桌面设置包 |
| 内容包校验时把声音编号集合传给 `atlasProblems`（目前只在测试里传） | PK-M1-41（素材入库后才有完整编号集合） |
| 第 7.16 节的澱源叠层、长者低吼、`sfx_cls_*` 与门类别音色 | PK-M1-41 之后的音频小包 |
| 只用手柄时的音频解锁（目前靠指针与键盘的首次输入） | PK-M1-23 或桌面壳 |
| 每帧开销的小优化 | 性能预算包 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 发行构建静默 | 发行版没有声音 | 打包步骤落地前不得宣称发行版有音频 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 无 | | |

**下一步与恢复方式**

1. 主会话提交本包改动（文件清单见上表），并更新计划包行状态、项目状态与进度日志。
2. 遗留按上表转去各包。

### 2026-11-17 提交依赖（主会话通知）

| 事项 | 说明 | 处理 |
| --- | --- | --- |
| 设置页依赖 PK-M1-22 的在途文件 | `src/client/windows/settings/` 整个目录（含 `shell_model.ts`、本包的 `audio_model.ts` 与 `audio_page.ts`）与 `tests/client_settings_shell.test.ts` 尚未入库；`settings_window.ts` 里的音频页登记只在它们就位后才成立 | 主会话等 PK-M1-22 完成后与它一并提交 |
| 分轨模块落在第三方目录 | `tools/assets/core/audio/stems.ts`、`meta.ts`、`process.ts` 的改动不随本包提交；`tests/audio_stems.test.ts` 依赖 `stems.ts` 与 `meta.ts` 的层校验，须与它们一起暂缓；`tests/audio_import.test.ts` 的单层断言（`processed as one layer`）对改前与改后的 `process.ts` 都成立，可以照常提交 | 需要时把分轨拆分逻辑作为本包自己的独立模块（目录在 `tools/assets/core/audio/` 之外）重新落地，或交给下一个改该目录的人；主会话说明现在不必重做。音频方向第 11.3 节已改为不点名文件 |

# PK-M1-06 音频引擎（别名：RE-15）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-06` 音频引擎 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-06` |
| 形态 | 大包（5 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 音频 |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-09（已完成：导入分支、事件表、`audio_director` 骨架） |
| 别名 | RE-15（[release_engineering.md](../../50_tech/release_engineering.md)）；音频方向第 5 到 10 节 |
| 立项日期 | 2026-11-17 |

## 1. 目标

游戏在有或没有音频文件、有或没有音频设备时都能运行：有素材时，音乐导演按位置、昼夜、战斗、首领、女神与过场选曲并按层增益切换，环境声按地图组合，
音效按事件与命中选择字段发声并空间化；没有素材或设备时静默，不出占位声，字幕照常出。序章"偷听"一拍有按距离分档的音量。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 导入分支分轨：`<id>.stems/` 文件夹（合并 `s1..sN` 或六轨 Demucs 布局，可带 `layers.json`），在混音上统一处理，输出 `_s1.._sN` | 已写成，未随本包入库（落在第三方目录 `tools/assets/core/audio/`，见 [progress.md](progress.md)）；待作为独立模块重新落地或交给该目录的所有方 | 音频方向第 11.3 节 |
| 2 | 音频子系统的各模块（纯逻辑与 Web Audio 薄层） | `src/client/audio/`（模块表见 `README.md` 与音频方向第 10.1 节） | RE-15；音频方向第 5 到 8 节 |
| 3 | 五条总线、闪避表、主链（限幅、夜间压缩、单声道折叠） | `bus_model.ts`、`audio_bus.ts` | 音频方向第 8.1、8.2 节 |
| 4 | 音乐导演扩展：天气、首领层、过场层数、时间跳过、昼夜切换间隔 | `audio_director.ts`、`music_player.ts` | 音频方向第 5 节 |
| 5 | 环境层与点缀调度，室内外过渡 | `ambience_mixer.ts`、`data/audio/ambience.json` | 音频方向第 6 节 |
| 6 | 声部池、抢占、节流、变体；空间化与八个混响区；序章偷听三档 | `sound_player.ts`、`spatializer.ts` | 音频方向第 7、8.3、8.4 节 |
| 7 | 命中音效选择字段与数据表 | `hit_select.ts`、`data/audio/selection.json` | 战斗与职业第 8.3 节；音频方向第 7.16 节 |
| 8 | 世界探针与编排：只读 `GameView` 与内核事件，不调内核命令 | `audio_world.ts`、`audio_engine.ts`、`index.ts`（`createGameAudio`） | 架构第 3 节 |
| 9 | 设置与无障碍：`audio` 选项块、`audioDevice`、字幕、减少突发巨响、减少闪烁与震动；手柄震动表；最小字幕画手 | `audio_settings.ts`、`captions.ts`、`caption_painter.ts`、`rumble.ts`、`haptics.ts`、`src/client/app/settings_schema.ts` | 音频方向第 10.3 到 10.5 节 |
| 10 | 设置页 `ui_set_audio` | `src/client/windows/settings/audio_model.ts`、`audio_page.ts`，登记于 `settings_window.ts` 与 `shell_model.ts` | 界面第 4.3 节 |
| 11 | 图集地图字段 `music`、`musicNight`、`ambience`、`ambiencePoints`、`reverbZone` 与 `atlasProblems` 校验 | `src/systems/world/atlas.ts`（`atlasAudioProblems`）、`data/world/atlas_maps.json`、`src/content/packs/world.ts` | 音频方向第 5.1 节 |
| 12 | 会话接线（一个分隔的块） | `src/client/app/session.ts`（`startAudio`、`audioFrame`、`stopAudio`） | 发行工程第 6.3 节 |
| 13 | 文档回写 | `docs/40_design/audio_direction.md` | 本包 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 辅助功能页（字幕样式与开关的完整页面、减少闪烁的画面实现） | PK-M1-23 |
| 2 | 过场与对话里对 `GameAudio` 的调用 | PK-M1-22 |
| 3 | 把分轨接入 `tools/assets/import.ts` | 导入管线的所有方（见 [progress.md](progress.md) 遗留） |
| 4 | 发行包的音频打包（发行构建目前静默） | 见 [progress.md](progress.md) 遗留 |
| 5 | 726 条素材本身 | PK-M1-41 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [audio_direction.md](../../40_design/audio_direction.md) 第 5 到 10 节 | 本包实现的规则与验收 |
| `src/client/audio/README.md` | 模块、接口表与数据 |
| `tests/client_purity.test.ts` 的 `CLIENT_PURE_CORES` | 纯核心守卫 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 纯核心 | 音频纯逻辑模块不碰 DOM、不用 `Math.random`、墙钟与 three.js | `tests/client_purity.test.ts` |
| 只读世界 | 音频只读 `GameView` 与内核事件，不调内核命令 | 评审 |
| 缺素材即静默 | 缺失的音效或曲目不出占位声 | `tests/audio_engine.test.ts` |
| 文本 | 可见文字走文本键，源码无中文字面量 | `node tools/i18n/check.ts` |

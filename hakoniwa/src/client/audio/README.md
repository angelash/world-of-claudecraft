# src/client/audio：音频子系统的本地说明

音频是客户端的一个子系统（[音频方向](../../../docs/40_design/audio_direction.md)第 10.1 节，[发行工程](../../../docs/50_tech/release_engineering.md)第 9 节）：只经 `GameView` 与内核事件读世界，不调用内核命令，不改变任何结果。
没有音频设备、音频上下文创建失败、或某个编号还没有通过的处理结果时，一律静默运行，不放占位音（音频方向第 9.2 节）；声音字幕与手柄震动不依赖音频设备。

## 模块

| 模块 | 职责 | 纯核心 |
| --- | --- | --- |
| `audio_director.ts` | 取曲优先级、战斗分级与滞回、紧张度、层增益、过渡（第 5 节） | 是 |
| `music_player.ts` | 分轨同步的曲目甲板、节拍网格、对齐切换、位置记忆；短乐句闸（第 5.2、5.3、5.7 节） | 是 |
| `ambience_mixer.ts` | 五层环境组合、室内外、点缀调度（第 6.1 节） | 是 |
| `sound_player.ts` | 声部池、抢占、节流与合并、变体与微随机（第 7.0、8.3 节） | 是 |
| `spatializer.ts` | 屏幕声像、距离、纵深、遮挡、混响区参数、偷听三档（第 8.4 节） | 是 |
| `bus_model.ts` | 五条总线、闪避表、主链（限幅、夜间压缩、单声道） | 是 |
| `audio_manifest.ts` | 读取素材清单与处理结果元数据，校验，按地图打包 | 是 |
| `audio_settings.ts` | 设置与无障碍的运行值（第 10.3、10.4 节） | 是 |
| `cue_map.ts` | 事件到音效编号（读 `data/audio/cues.json`） | 是 |
| `hit_select.ts` | 命中音效选择字段（[战斗与职能](../../../docs/40_design/systems/combat_and_classes.md)第 8.3 节），声音族群、首领声、脚步地面（读 `data/audio/selection.json`） | 是 |
| `captions.ts` | 声音字幕的行板 | 是 |
| `rumble.ts` | 手柄震动表（第 10.5 节） | 是 |
| `audio_world.ts` | 探针：从 `GameView` 与事件得出每帧的输入与触发 | 是 |
| `audio_engine.ts` | 编排：把以上各核心串起来，产出给音频图的操作列表 | 是 |
| `audio_bus.ts` | 唯一碰 Web Audio 的模块：音频图、解码与预算 | 否 |
| `audio_loader.ts` | 开发构建读取素材清单与元数据 | 否 |
| `caption_painter.ts`、`haptics.ts` | 字幕绘制器、手柄震动输出 | 否 |
| `browser_audio.ts`、`index.ts` | 浏览器接线；桶与对外接口 `GameAudio` | 否、桶 |

纯核心登记在 `tests/client_purity.test.ts` 的 `CLIENT_PURE_CORES`，在 Node 中测试（`tests/audio_engine.test.ts`、`tests/audio_world.test.ts`）。

## 对外接口（`GameAudio`，会话持有 `session.audio`）

| 调用 | 谁用 | 作用 |
| --- | --- | --- |
| `setCutscene({ music, layers, silence })`、`setCutscene(null)` | 过场播放器 | 镜头表的曲目、起始层数、写定的静默（第 5.9 节） |
| `playSound(id, { group: 'cine', caption, loud, at })`、`stopSound(id)` | 过场播放器、界面 | 写定音效；`caption` 为 `audio.cap.<编号>` |
| `playStinger(id, cls)` | 过场播放器 | 短乐句，经第 5.7 节的间隔与优先级 |
| `setDivine(music)`、`setDream(on)` | 神谕演出、梦境 | 女神主题、梦境曲 |
| `setListenTier('far' 或 'mid' 或 'near')` | 序章 P5 | 偷听三档：帘幕后的对话音音量与低通、候见厅曲的 L2 |
| `playSound('sfx_ui_blip_<谁>')` | 对话框 | 逐字对话音（跟随设置与偷听档） |
| `modelWait('start' 或 'reply' 或 'error')` | 对话与大模型 | 等待音与回应音、错误音（第 5.10 节） |
| `rumble(ev)` | 过场播放器 | 表外的手柄震动（首领重踏） |
| `settingsChanged()` | 设置页、窗口焦点 | 立即应用设置与后台规则 |

## 数据

- `data/audio/cues.json`：事件到音效（含短乐句的优先级类 `stingerClass` 与排队 `queue`，巨响标记 `loud`）。
- `data/audio/ambience.json`：天气层、澱层、按地点种类的室内底层、点缀的字幕。
- `data/audio/selection.json`：职能到武器类、外形与族群到声音族群和材质、首领声与首领曲、地块到脚步地面。
- 地图的音乐、环境底层、点缀池与混响区登记在图集 `data/world/atlas_maps.json`，由 `atlasProblems` 校验。
- 字幕文字在 `locales/zh-Hans/ui.json` 的 `ui.ovl.caption.<编号>`。

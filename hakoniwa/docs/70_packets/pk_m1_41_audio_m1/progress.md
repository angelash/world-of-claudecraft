# PK-M1-41 音频 M1：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 暂定采用、导入、开发版接线（与 PK-M0-11 同一会话） | 729 条音频经审核台采用代码落成原文件并登记为 `review`；导入与校验；开发版加载 `review`；问题清单 | 未提交 | 见 `verification_matrix.md` | 主审在素材审核台试听；第 3 节的工具问题交 `tools/assets` 与 `tools/audio_gen` 的所有方；修好的编号重新采用 |
| 2026-11-19 | 循环条目按 R4 重新采用 | 音频会话重排循环候选（`6cd38acf08`、`d12272c111`，报告 `.local/audio_batch/restage_report.json`）后，经审核台的 `adopt` 重新采用 82 个编号：在 `rework` 的 47 个循环条目全部，加候选被重排的 35 个 `review` 条目。R4：报告里 `importProblems` 为空的候选中取 `seamLevelStepDb` 最小的，同值按候选池顺序（重排没动的候选用导入自己的接缝测量）；选中的就是现行原文件时不重采（5 个），候选都没重排的不动（3 个）；选中的导入不过时取下一条（`sfx_rng_arrow_fly` 由 `l3` 换 `l2`）。备注与审核记录写明 R4 与"未试听" | 未提交 | `assets:register` nothing new；`assets:import` 82 processed，2 with problems（换候选后剩 `amb_fall_void`）；`assets:check -- --mark` 0 marked；末次 `assets:check`：`946 record(s), 0 error(s), 0 stale, 325 failing check(s)`。音频 `review` 530 到 576，`rework` 199 到 153（`seam` 47 到 1）。开发版（`hakoniwa` 配置）：`amb_divine_court`、`amb_earth_last_train`、`amb_inner_court`、`amb_base_forest` HTTP 200，浏览器解码为 48 kHz 立体声并带循环点；开发状态的音频索引收进 9 个抽查编号，0 问题。四个单测文件 128 个用例通过 | 主审试听；`amb_fall_void` 见 B1；`_rejected/audio/` 见 B13 |

## 2. 汇报

### 2026-11-18 暂定采用、导入、开发版接线

**采用的范围与顺序**：先是序章与第一幕地图登记的音乐与环境声（38 个编号），再是事件表、导演与过场会触发的编号（273 个，含 M2 批次里第一幕会触发的 `mus_cmb_tide`、`sfx_door_seal_mid`、`sfx_god_moira_page`），再是其余 M1 条目（418 个）。合计 729 条，M1 的 726 条全部有原文件。M2、M3 不做。

**挑选规则**：R1 与 R2 见 `README.md` 第 2.1 节。导入之后增加一条：

| 规则 | 内容 |
| --- | --- |
| R3 | 采用的音乐没过导入的循环接缝检查（`seam`）时，按候选池顺序换下一条重新采用并导入，取第一条过检的；都不过时，取接缝电平跳变最小的一条 |

R3 的结果：17 首里 8 首换到过检的一版（`mus_act1_beast_tide`、`mus_boss_standard`、`mus_cmb_skirmish`、`mus_cue_warmth`、`mus_dg_ancient`、`mus_god_moira`、`mus_inner_court_day` 等），9 首两版都不过（第 3 节 B2）。被替换的原文件由审核台移进 `_rejected/audio/`，按素材说明第 3.3 节清理（第 2.3 节）。

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `assets/tools.json` | 修改 | `stable_audio_3_small_sfx` 的 `commercialUse` 改为 `true`，`termsCheckedAt` 2026-11-18，`outputRights` 写明用户 2026-11-18 确认已登记社区许可；新增 `xiaojiu`（PK-M0-11） |
| `assets/manifest.json`、`assets/review_log.jsonl` | 经审核台代码与导入命令写 | 不手改；每次采用一条审核记录，备注写明规则号与"未试听，由主审定" |
| `assets/audio/**`、`assets/processed/audio/**` | 新增 | 采用的原文件（Ogg q8）与导入结果；Git LFS 路径，留在本机 |
| `src/client/audio/audio_manifest.ts` | 修改 | `approvedAudio(raw, statuses = ['approved'])`、`buildAudioIndex(..., statuses = ['approved'])`；默认行为不变 |
| `src/client/audio/audio_loader.ts` | 修改 | `AudioLoadOptions.statuses`，传给上面两个函数 |
| `src/client/audio/browser_audio.ts` | 修改 | 开发版的 `loadIndex` 传 `loadedStatuses(location.search, true)` |
| `src/client/audio/README.md` | 修改 | 一句：开发版另外加载 `review`，`?assets=approved` 只放已通过的 |
| `tests/audio_engine.test.ts` | 修改 | 一个新用例：默认只认 `approved`；带开发状态时 `review` 进索引，`rework` 不进 |
| `docs/70_packets/pk_m1_41_audio_m1/` | 新增 | 本目录三件 |

开关本身（`src/client/assets/types.ts` 的 `loadedStatuses`）、美术一侧的改动与 `assets/README.md` 的一条见 PK-M0-11 的 `progress.md`。

**接入他系统的方式**：只读 `data/audio/cues.json`、`data/audio/selection.json`、`data/world/atlas_maps.json` 求出要采用的编号，三个文件都没有改。`cues.json` 里 PK-M1-12 加的 `telegraph_warn` 行照常参与（它选中的 `sfx_sch_*_aoe` 已采用）。

### 2.1 开发版里听得到什么

开发服务（`hakoniwa-review` 配置，端口 5180）里，用 `loadedStatuses` 的开发状态建的音频索引在第一次导入时有 650 个可播编号（音乐 56、环境 10、音效与界面 584）；`assets:check --mark` 把没过校验的改为 `rework` 后，可播的是 530 条 `review`（见 `verification_matrix.md`）；`?assets=approved` 时为 0，与发布版一致。在页面里抽查 `mus_reg_lotha_north`、`mus_inner_court_day`、`mus_dg_ancient`、`mus_stg_quest_new`、`amb_pt_church_bell`、`sfx_ui_click`、`sfx_mon_canine_attack`：处理结果都由开发服务给出（HTTP 200）并由浏览器 `decodeAudioData` 解码成功，48 kHz，循环曲带循环点。游戏里的发声在第一次用户输入后开始（浏览器的自动播放规则）。

### 2.2 测试

见 `verification_matrix.md`。延后的测试（本会话按用户要求不跑）：

| 套件 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | 清单从空变成 900 多条；读真实清单的测试见 `verification_matrix.md` 第 3 节 |
| `tests/audio_import.test.ts`、`tests/audio_stems.test.ts`、`tests/audio_gen_batch.test.ts` | 读导入与生成的代码，本会话没改它们，但清单与候选池的状态变了 |
| `tests/release_bundle.test.ts` | 发布版构建与扫描；开关不进发布版，宜确认一次 |
| `tests/audio_world.test.ts` | 音频世界探针，读同一个索引 |
| `npm run playthrough` | 不受音频影响（音频不回写内核），列出备查 |

### 2.3 清理

见 `verification_matrix.md` 第 4 节。

## 3. 问题清单（早期发现，修复在后）

种类：导入原因码、尺寸或格式、文件名对不上编号、幕需要的条目缺失、循环接缝、响度、工具缺陷、流程协调。编号清单在本机临时目录的报告里，可用第 3.1 节的命令重出。

| 序 | 编号 | 种类 | 证据 | 建议的修法 | 负责方 |
| --- | --- | --- | --- | --- | --- |
| B1 | `amb_fall_void`（坠落虚空 `gap_void` 唯一的环境底层，序章与第五到第七幕） | 循环接缝（循环长度） | 两版候选都是 45 秒循环体加交叉淡化，导入切得出循环；校验报 `seam/loop_length`："loop body 45.00 s, expected 60.0 to 120.0 s"。提示词条目写"循环体约 45 秒"，`tools/assets/core/audio/plan.ts` 的 `audioPlanOf` 对 `ambience_bed` 固定要求 60 到 120 秒，不看条目写的长度。重排报告的 `importProblems` 只跑 `processAudio`，不跑这条元数据检查，所以报告里两版都显示无问题。结果：这张地图仍是 `rework`，游戏里静默。其余 27 条环境底层与 `mus_town_borderstone_day` 已按 R4 重新采用并回到 `review`（第 1 节 2026-11-19 行） | 二选一：`ambience_bed` 的循环长度范围按条目写的长度定，或把条目改为 60 秒以上再重排；重排报告同时跑元数据检查 | `tools/assets`、`tools/audio_gen` 的所有方；提示词库 |
| B2 | 音乐 9 首：`mus_cue_comedy`、`mus_cue_dream_door`、`mus_god_merca`、`mus_god_sylvie`、`mus_inner_court_night`、`mus_pro_antechamber`、`mus_pro_earth`、`mus_title_main`、`mus_town_borderstone_night` | 循环接缝（待试听） | 重排把候选切到导入接缝检查能过的小节起点，R4 重新采用后都过检并回到 `review`，接缝电平跳变 0.16 到 1.73 dB（上限 3 dB）。ACE-Step 只用提示词生成，循环点是事后在小节网格上找的，听感没确认；序章的地球与候见厅、门内庭院夜、标题曲都在里面 | 主审在审核台开循环试听；听得出接缝的，用乐谱直出加翻奏的路线（试做曲的 A、B 组）重做 | 主审；`tools/audio_gen` 的所有方 |
| B3 | 循环音效 9 条：`sfx_cin_a1_quill_night`、`sfx_cls_warlock_drain_life`、`sfx_env_seal_stone`、`sfx_god_eluen_halo`、`sfx_god_merca_coin_float`、`sfx_pres_heartbeat_low`、`sfx_sch_nature_cast_loop`、`sfx_sch_shadow_cast_loop`、`sfx_ui_llm_thinking` | 循环接缝（待试听） | R4 重新采用后都过检并回到 `review`，接缝电平跳变 0 到 1.3 dB。效果循环按最安静的接缝网格切，不按节拍：`sfx_pres_heartbeat_low` 与 `sfx_pres_heartbeat_high` 是威压心跳（0 级不可抢占），过接缝时心跳间隔可能不匀 | 主审试听；心跳类听得出就改用节拍对齐的切法 | 主审；`tools/audio_gen` 的所有方 |
| B4 | 60 条多变体音效与点缀（序章与第一幕会触发的 23 条，例如 `amb_pt_branch_snap`、`amb_pt_dog_bark`、`amb_pt_owl`、`amb_pt_rooster`、`sfx_hit_slash_bone`、`sfx_hit_pierce_wood`、`sfx_mon_canine_death`、`sfx_mon_boar_death`、`sfx_door_open_minor`、`sfx_down_revive`、`sfx_boss_colossus_roar`） | 导入原因码 `format/variants` | "found 8 sounding part(s), the entry asks for 4 variants"：Stable Audio 的单条候选里本身有几段发声（犬吠两声、鸟叫几声），按顺序拼接后导入的分段数多于变体数 | 批处理逐条裁成一段（`trimHit` 只截长度，不保证只有一段）；或导入按采用时写入的候选边界拆分（`HAKONIWA_CANDIDATES` 注释已记了几条） | 同 B1 |
| B5 | 55 条：例如 `amb_pt_branch_snap` | 响度（`loudness/limiting`） | "reaching the target needs 10.6 dB of peak limiting (over 9 dB): too spiky"：短促的瞬态要拉到模板的瞬时响度目标，限幅超过上限 | 换候选（池里还有其余几条）；或这类模板改用短时响度 | 主审在审核台换候选；音频方向第 8.1 节的模板目标 |
| B6 | 55 条 `loudness/loudness`、31 条 `loudness/true_peak` | 响度 | 编码后复测仍差目标 1 LU 以上或真峰值超上限（三遍编码后） | 随 B5；查导入的三遍收敛是否够 | `tools/assets` |
| B7 | `sfx_cin_crowd_cheer`、`sfx_cin_wall_murmur`、`sfx_door_corridor_open` | 尺寸或格式（`format/duration`） | 时长超出模板上限 | 采用时裁短或换候选 | 主审；`tools/audio_gen` |
| B8 | 全部音乐 | 工具缺陷（分轨） | 多层曲目一律按单层导入（"entry asks for N layers; no stem folder"），导演按层加减的紧张度、昼夜减层、首领分阶段都退化成整首 | PK-M1-06 留下的分轨模块重新落地并接入导入 | 本包后续轮次，与 `tools/assets` 的所有方协调 |
| B9 | `sfx_wpn_bow_light`、`sfx_wpn_bow_heavy` | 幕需要的条目缺失 | `data/audio/selection.json` 把猎人的武器写成 `bow`，事件表的挥动行按 `sfx_wpn_{weapon}_{weight}` 取音效，提示词库没有这两个编号（弓的出手另有 `sfx_rng_*`）；运行时会落到回退 `sfx_wpn_unarmed_light` | 挥动行对远程武器跳过（行里已有 `unless.attack` 的 ranged，查猎人的近战形态），或提示词库补两条 | 事件表的所有方（PK-M1-06）；提示词库 |
| B10 | `sfx_pres_heartbeat`、`sfx_boss_roar`、`sfx_door_open`（字幕键） | 幕需要的条目缺失（低） | 事件表里这三个是字幕键的主干，不是音效编号，对应的音效都有（`_low`、`_high`、`_major`、`_minor` 等）；记下以免误读 | 无 | 无 |
| B11 | 美术处理结果（详见 PK-M0-11 的 A12） | 流程协调 | 美术执行器（`.local/art_generation/`）在 21:20 前后用旧导入版本的结果覆盖了 `assets/processed/` 下 126 条美术处理结果，`assets:check` 报过时，开发版退回占位；它记为 `approved_delivery_integrity_restored`。用户已让执行器改为只写候选池（`.local/art_generation/HANDOFF_ASSET_PIPELINE.md`） | 执行器按交接文件改完之前不反复重导；改完后重跑一次导入与校验。本会话收尾时重导一次，`assets:check` 报 0 条过时 | 用户的美术执行器 |
| B12 | 全部记录 | 流程协调 | 处理结果的导入版本 `1.0.16` 来自 `tools/assets/core/meta.ts` 未提交的改动；若处理结果先于那份工具改动提交，干净克隆会判它们过期 | 与 `tools/assets` 的改动一起提交，或提交前重导 | 提交的主会话 |
| B13 | 采用代码 | 工具缺陷（低） | `store.adopt` 把被替换的原文件移进 `_rejected/` 时，同名文件加 `_2`、`_3` 后缀；R3 的试换在 `_rejected/audio/` 留下 26 个 Ogg（约 80 MB），其中 4 个与现行原文件逐字节相同（换回了第一版）。那 26 个已清理；R4 的重新采用又留下 83 个（约 138 MB），与现行原文件没有逐字节相同的 | 采用时若新原文件与被替换的同哈希就不移；`_rejected/` 按素材说明第 3.3 节在批次关闭后删除 | `tools/assets` 的所有方 |
| B15 | 文件名与来源 | 文件名对不上编号；合规与来源 | 采用代码按提示词条目的 `file` 落盘，没有文件名问题；每个原文件都带审核台写的 AIGC 注释与候选编号注释 | 无 | 无 |
| B14 | `amb_pt_*` 等点缀 | 工具缺陷（低） | 候选的 `metrics` 只有生成耗时与显存，音效与点缀没有响度测量值；R1 对它们只查工具与主文件，等于取候选池第一条 | 批处理给每条候选记响度、峰值、发声段数，挑选规则才有依据 | `tools/audio_gen` 的所有方 |

### 3.1 复查命令

```
npm run assets:check                 # 全部 fail 行与原因码
node <报告脚本> <hakoniwa> <输出目录> # 本会话的脚本：按处理结果的元数据分类（本机临时目录）
```

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | 挑选规则 R1 到 R3 是否接受为暂定 | 729 条按它采用，未试听 | 接受，主审在审核台逐条换；或给出别的规则重跑 |
| 2 | B2 的 9 首音乐 | R4 重新采用后都过导入的接缝检查，听感未确认 | 推荐：主审开循环试听，听得出接缝的按试做曲的乐谱路线重做 |
| 3 | B9 弓的挥动音 | 落到徒手回退 | 推荐：挥动行跳过远程武器 |

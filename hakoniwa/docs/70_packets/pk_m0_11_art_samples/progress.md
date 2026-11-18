# PK-M0-11 PT-07 AI 素材样板：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 首批交付登记与接线（与 PK-M1-41 同一会话） | 登记小九 AI 图像工具；`assets/art/` 的原图全部登记为 `review`、导入、校验、开发图集；开发版加载 `review`；读联系表；问题清单 | 未提交 | 见 `verification_matrix.md` | 主审在素材审核台逐张看；第 3 节的问题交各负责方；第 4 节待用户定 |

## 2. 汇报

### 2026-11-18 首批交付登记与接线

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `assets/tools.json` | 修改 | 新增 `xiaojiu`（图像）：`usedVersions` 取执行器运行记录里的模型名 `gpt-image-2`；`termsCheckedAt` 2026-11-18；`commercialUse: true`（用户 2026-11-18 确认条款）；条款链接、原文摘录、隐式标识写明"未记、待补"，不编造。音频工具一行见 PK-M1-41 |
| `assets/manifest.json` | 经命令修改 | `npm run assets:register` 写入美术记录（状态 `review`）；导入没有改美术记录的状态；`npm run assets:check -- --mark` 把 `art_vfx_school_fire_projectile` 改为 `rework`（`palette`：5 色，弹道模板至多 4 色） |
| `assets/processed/<类>/` | 经命令改写 | `npm run assets:import -- --all --id <全部美术编号>` 按当前导入版本重出（执行器先前写的处理结果来自多个旧导入版本），联系表覆盖全部 |
| `src/client/assets/types.ts` | 修改 | 新增 `loadedStatuses(search, dev)`：开发版返回 `approved` 与 `review`，`?assets=approved` 或非开发版只返回 `approved` |
| `src/client/assets/resolver.ts` | 修改 | `AssetSource.statuses`（默认 `approved`）；构造与 `lookup` 按它判断，默认行为不变 |
| `src/client/assets/loader.ts` | 修改 | `LoadOptions.statuses`；`installApprovedArt` 传 `loadedStatuses(location.search, true)`；这个函数本来就只在开发版运行 |
| `tests/client_assets.test.ts` | 修改 | 两个新用例（开关的取值；开发状态下审核中的美术解析并解码，返工不解析，`?assets=approved` 只剩通过的）；原用例"真实清单为空"改为"真实清单不配处理结果时不装任何图"（第一次采用后清单不再为空） |
| `assets/README.md` | 修改 | 第 4 节一条：开发版加载 `review` 与 `?assets=approved` |
| `docs/70_packets/pk_m0_11_art_samples/` | 新增 | 本目录三件 |

**登记命令（原样）**

```
npm run assets:register -- --tool xiaojiu --tool-version gpt-image-2 --lang en --converted --date 2026-11-18 --notes "Delivered by the local art executor (.local/art_generation run 20261116-fdcb01) through 小九 AI, model gpt-image-2; file dates 2026-11-16 to 2026-11-18, registered in one batch with the latest date. The file is the executor's normalized copy (crop or nearest-neighbour resize); the provider's raw PNG with its C2PA manifest stays in the run's candidates folder (PK-M0-11)."
```

结果：`190 registered, 0 refused`。提示词语言取 `en`：执行器发给生成服务的提示词是英文（运行目录 `prompts/`）。`--converted` 与备注后来查明只对其中一部分成立，见第 3 节 A3。工作期间执行器又交付了新原图，第二次登记见 `verification_matrix.md` 第 1 节。

**开发版里看得到什么**：开发服务（`hakoniwa-review` 配置，端口 5180）进游戏后，安装的解析器有 148 个可画的编号（全部 `review`；参照三视图不画）；远景天幕 `art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid` 解析并解码成功，洛萨平原风格包的地图（边石镇等）由 PK-M1-24 的 `bitmapPixels` 画出；坐骑驴 `art_pet_mnt_donkey_d` 解析成功。其余类别（图标、地块、建筑、道具、特效、界面、区域图、首领卡、风格板）已登记、已导入、进了开发图集，但客户端还没有读它们的地方（第 3 节 A11）。

## 3. 问题清单（早期发现，修复在后）

种类：导入原因码、尺寸或格式、文件名对不上编号、幕需要的条目缺失、视觉问题（联系表）、风格不符、工具缺陷、合规与来源。证据里的命令与文件都在本机可复查。

| 序 | 编号 | 种类 | 证据 | 建议的修法 | 负责方 |
| --- | --- | --- | --- | --- | --- |
| A1 | 100 张原图（不带 `caBX` 块的那些，名单可用第 3.1 节的命令列出） | 合规与来源 | 小九 AI（`gpt-image-2`）的原始输出带 C2PA 清单（PNG 的 `caBX` 块，`urn:c2pa:<编号>`）；登记时 `assets/art/` 里 90 张与执行器运行目录 `candidates/` 的原始文件逐字节相同、带 C2PA，另外 100 张是执行器裁切或缩放过的副本，不带 C2PA。素材说明第 5 节要求原文件按原样保存、隐式标识不删 | 执行器把服务给的原始文件放进 `assets/art/`，裁切与缩放交给导入（导入本来就做唯一一次尺寸采样）；已交付的 100 张按原始文件重新落盘后重新登记 | 用户的美术执行器（`.local/art_generation/`）；PK-M0-05 |
| A2 | 全部美术记录；`assets/tools.json` 的 `xiaojiu.aigcLabel` | 工具缺陷；登记待改 | `tools.json` 的 `aigcLabel` 仍写"待查"，本包已查明原始输出带 C2PA，应改写；`tools/assets/core/register.ts` 的 `aigcLabelOf` 与导入的 `labelChunks` 只读 PNG 文本块，不认 `caBX`；带 C2PA 的 90 张也登记成 `aigcLabel: none`，处理结果的 PNG 也不带 C2PA | 识别 `caBX`（记下清单编号），处理结果保留同一标识 | `tools/assets/` 的所有方 |
| A3 | 带 C2PA 的 90 张 | 工具缺陷（含本会话的登记失误） | 第一次登记对 190 张一律用了 `--converted` 与"处理过的副本"备注；对这 90 张，`converted` 应为 `false`，备注不对。`register` 只在文件字节变化时重写记录，审核台也不能改这两个字段，所以本会话改不回来（不手改清单） | 加一条更正记录字段的正规路径（审核台的"更正来源"或 `register --relabel`），然后把这 90 条的 `converted` 改为 `false`、备注改为"原始文件" | `tools/assets/` 的所有方；改好后由本包重跑 |
| A4 | 全部美术记录 | 工具缺陷 | `assets:register` 一次运行只接受一个 `--date`、`--notes`、`--converted`，也没有 `--id` 过滤；文件日期是 2026-11-16 到 11-18，`generatedAt` 只能统一写 2026-11-18 | 按文件取日期（或接受 `--date-from-mtime`），加 `--id` | `tools/assets/` 的所有方 |
| A5 | 第一批 182 张里 102 张（图标 1254×1254、特效 1774×887、卡片 1086×1448、风格板 1672×941、坐骑 1774×887 等） | 尺寸或格式 | 与模板 `canvas` 不同；这是执行器"保留服务原始像素网格，由导入做唯一一次尺寸采样"的做法，导入全部通过；`art_ico_marker_presence` 是 800×800，比画布小 | 美术方案第 13 节与模板的 `canvas` 写明"服务给多大收多大，导入采样"；`art_ico_marker_presence` 查执行器为何缩小 | 美术方案；执行器 |
| A6 | `art_ico_door_past_life_abacus`、`art_ico_door_past_life`、`art_ico_door_inner_garden`、`art_ico_door_vocation_druid`、`art_ico_div_rumor_battle`、`art_ico_sys_win_deeds`、`art_ico_sys_win_quests`、`art_doll_back_bell_pack`、`art_prop_raven_great_nest`、`art_style_sealed_ruins`、`art_style_wild_forest` | 导入提示 `text` | 导入第 12 步"疑似文字"（细笔画密集）。抽查 `art_ico_door_past_life_abacus`：是算盘珠，不是字，误报 | 主审逐张确认；若都是纹样，考虑对门图标与道具放宽这条检测 | 主审；`tools/assets/` |
| A15 | `art_vfx_school_fire_projectile` | 导入原因码 `palette` | `assets:check`："5 colors, at most 4 per sheet"，记录为 `rework` | 局部重画减色，或导入对弹道放宽到 5 色 | 主审；执行器 |
| A7 | `art_style_lothar_plain`、`art_style_ash_waste`、`art_style_sealed_ruins`、`art_style_wild_forest`、`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_ico_sys_cur_health`、`art_pet_mnt_donkey_d`、`art_vfx_amb_butterflies` | 导入提示 `palette`；视觉问题 | 局部调色板损失超过 0.07。看过处理结果：`art_style_lothar_plain` 原图的蓝天量化后成了灰白的阴天；`art_bg_lothar_plain_mid` 的金色麦田变成浅褐 | 风格板（`bg_cg`）要么允许天空色，要么在风格包色板里补天空蓝；天幕层看渲染后的效果再定 | 美术方案的色板（`tools/assets/core/palettes.ts` 的所有方）；主审 |
| A8 | `art_bg_lothar_plain_mid`、`art_style_lothar_plain` | 风格不符 | 教堂尖顶上是拉丁十字；本作的礼拜堂与神龛挂所奉女神的圣徽（[catalog_buildings_city.md](../../40_design/content/catalog_buildings_city.md) 的 `bld_chapel`、`bld_shrine` 与圣徽行），现实宗教符号不该出现 | 条目的 `extra` 或全局反向提示词加"不画十字架与现实宗教符号"；这两张局部重画 | 提示词库（PK-M0-07 的所有方）；执行器 |
| A9 | `art_map_ashen_waste` | 风格不符（低） | 外缘画了几处村落与成片农田，条目没写；荒原外缘有没有人烟要按地理正典判 | 主审对照地理文档决定是否重画 | 主审 |
| A10 | `art_bg_cut_a1_colossus`、`art_bg_cut_a1_dream_court`、`art_bg_cut_a1_dream_door`、`art_bg_cut_a1_martha_light`、`art_chr_martha_strike`、`art_chr_yeyu_unfold`（`data/scenes/act1.json`）；`art_bg_lothar_plain_clouds`；`art_style_divine_court`、`art_style_earth_modern`；`art_chr_yeyu_ref`、`art_doll_mannequin_h_ref` | 幕需要的条目缺失 | 第一幕插画与天幕的云层没有原图；执行器状态：`art_style_divine_court` 为 `blocked_specification`，`art_style_earth_modern`、`art_chr_yeyu_ref`、`art_doll_mannequin_h_ref` 为 `failed`，序章两个场景（候见厅、地球）的风格板与主角参照都缺，依赖它们的条目被挡住 | 先解开这四个参照与风格板（执行器的失败原因与规格阻塞），再出第一幕插画 | 用户的美术执行器；PK-M1-36 |
| A11 | 图标、地块、建筑、道具、特效、界面、区域图、首领卡、风格板（全部已登记、已导入） | 消费方缺失 | 客户端里读解析器的只有生灵与人物动作表、头像与半身、剧情插画（`art_bg_cut_*`）、远景天幕（`bitmapPixels`）；其余类别没有一处读取，开发版里看不到 | 各类素材的接入：图集（PK-M1-04）、HD-2D 的地块与建筑（PK-M1-24）、界面图标与卡片（界面各包） | PK-M1-04、PK-M1-24、界面各包 |
| A12 | 全部美术处理结果 | 工具与流程协调 | 美术执行器在本会话期间仍在交付，并且自己也写 `assets/processed/`。本会话按当前导入版本 `1.0.16` 重出全部处理结果后，执行器在 21:20 前后记了 147 条 `approved_delivery_integrity_restored`，用 1.0.1 到 1.0.12 的旧结果改回了 126 条，`assets:check` 报过时，开发版退回占位。用户已让执行器只写候选池（`.local/art_generation/HANDOFF_ASSET_PIPELINE.md`）。本会话收尾时重导一次，`assets:check` 报 0 条过时；执行器若在改之前再跑，会再次改回 | 执行器按交接文件改为只写 `assets/_candidates/art/`，之后重导一次 | 用户的美术执行器 |
| A13 | 全部处理结果 | 工具与流程协调 | 处理结果的导入版本是 `1.0.16`，来自 `tools/assets/core/meta.ts` 尚未提交的改动（已提交的是 `1.0.0`）；若处理结果先于那份工具改动提交，加载器与 `assets:check` 会判它们过期 | 与 `tools/assets/` 的改动一起提交，或在提交前重跑导入 | `tools/assets/` 的所有方；提交的主会话 |
| A14 | 文件名 | 文件名对不上编号 | 登记前用 `tools/assets/core/register.ts` 的 `matchFile` 逐个核对：全部原图都对得上提示词条目，没有拒收 | 无 | 无 |

### 3.1 复查命令

```
node <c2pa 扫描脚本> assets <输出.json>      # 逐个读 PNG 块，列出带 caBX 的原图（本会话的脚本在本机临时目录）
npm run assets:import -- --all --id <编号>     # 重出并在 ../.local/contact/ 写联系表
npm run assets:check
```

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | 原图用服务的原始文件还是执行器处理过的副本（第 3 节 A1） | 190 张里 100 张是处理过的副本，丢了 C2PA | 推荐：一律用原始文件，处理交给导入；或接受副本并在记录里写明 |
| 2 | 小九 AI 的条款链接与原文摘录（`tools.json` 的 `termsUrl`、`outputRights`、`aigcLabel`） | 写的是"未记、待补" | 用户补链接与摘录（PK-M0-05 第 12.1 节清单） |
| 3 | 拉丁十字（第 3 节 A8） | 两张图上有 | 推荐：提示词加禁止项并局部重画 |

# assets/：AI 生成的美术与音频素材

> 归属：《箱庭纪》素材目录。作用：存放全部美术与音频素材的提示词库、AI 生成的原文件、导入处理结果与素材清单。
> 上游：`../docs/00_vision/decision_log.md` 的 D-018（美术与音频全部 AI 生成）、D-080（音频）、D-015 与 D-017（许可边界）。
> 规则的出处：美术方案 `../docs/50_tech/art_pipeline.md`（第 6、9、11、13、15 节）；音频方案 `../docs/40_design/audio_direction.md`；
> 提示词库的使用说明 [prompts/README.md](prompts/README.md)。

## 0. 一页结论

1. 游戏里的每一张图、每一段声音都是这里的一个文件，每个文件都对应提示词库里的一个条目（同一个编号）。
2. 提示词库提交的源是 `prompts/templates.json`、`prompts/templates_audio.json` 与 `prompts/specs/*.json`；用户先在 `hakoniwa/` 运行 `npm run prompts`，在本机生成展开后的 `prompts/out/`（不提交），再把其中的提示词交给小九 AI 生成，原文件按编号放进 `art/<类>/` 或 `audio/<类>/`，登记进 `manifest.json`，经导入管线进入游戏。
3. 原文件是来源证据，保留生成服务写入的元数据；处理结果在 `processed/`；没有通过审核的编号在游戏里显示程序化占位。
4. 只放本作用 AI 工具生成并登记过的文件；不放任何第三方素材、其他作品的截图或参考图。

## 1. 目录结构

```text
assets/
  README.md                本文件
  manifest.json            素材清单：美术与音频共用，每个文件一条记录
  tools.json               生成工具登记（条款、商用许可、隐式标识）与排版字体授权
  prompts/                 提示词库
    README.md              给用户的使用说明
    templates.json         美术模板与风格包
    templates_audio.json   音频模板
    specs/<名>.json        按类别的条目文件（美术与音频各若干份）
    out/                   npm run prompts 在本机生成：<名>.md、<名>.csv、manifest.json（不手改，不提交；npm run prompts:check 核对）
  art/<类>/                美术原文件（Git LFS）
  audio/<类>/              音频原文件（Git LFS）
  processed/<类>/          美术导入处理结果：PNG 与帧元数据 JSON（入库，体积小）
  processed/audio/<类>/    音频处理结果：ogg 与每个编号一份元数据 JSON（Git LFS）
  _rejected/               淘汰的原文件，只在本机，不入库，批次关闭后删除
```

`art/` 的子目录与模板的 `outDir` 一一对应：

| 子目录                         | 内容                                                       | 模板                                                         |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `art/characters/`              | 主要角色动作条；纸娃娃服装层的动作条                       | `chr_*`                                                      |
| `art/characters/ref/`          | 主要角色三视图参照                                         | `chr_turnaround`                                             |
| `art/doll/`                    | 纸娃娃头部件、表情件、手持物、后挂件                       | `doll_head`、`doll_face`、`doll_held`、`doll_back`           |
| `art/doll/ref/`                | 固定人台与服装三视图                                       | `doll_mannequin`、`doll_outfit_ref`                          |
| `art/portraits/`               | 头像表情表                                                 | `por_main`、`por_npc`                                        |
| `art/busts/`                   | 半身立绘与表情差分                                         | `bust_base`、`bust_expr`                                     |
| `art/monsters/`                | 魔物动作表                                                 | `mon_*`                                                      |
| `art/monsters/ref/`            | 魔物、首领、兽伴、坐骑、兵团的三视图参照                   | `mon_turnaround`                                             |
| `art/bosses/`                  | 首领动作表、分部件拆图、登场插画                           | `boss_*`                                                     |
| `art/creatures/`               | 坐骑动作表                                                 | `pet_mount`、`pet_mount_large`                               |
| `art/tiles/`                   | 地面瓦片与点缀件                                           | `tile_*`                                                     |
| `art/buildings/`               | 墙面、屋面、条带、立面构件、标志构件                       | `bld_*`                                                      |
| `art/props/`                   | 道具、装饰、地标、采集点                                   | `prop_*`                                                     |
| `art/backgrounds/`             | 远景天幕分层                                               | `bg_layer`                                                   |
| `art/backgrounds/cg/`          | 剧情全屏插画                                               | `bg_cg`                                                      |
| `art/icons/<子类>/`            | `items`、`skills`、`auras`、`doors`、`deeds`、`ui`、`markers`、`buildings`、`units` | `ico_*`                              |
| `art/vfx/`                     | 特效序列帧、弹道、循环特效、叠加纹样                       | `vfx_*`                                                      |
| `art/ui/`                      | 卡片底图、角花、九宫格边框、标题与载入画面                 | `ui_*`                                                       |
| `art/units/`                   | 兵团立牌动作表                                             | `unit_*`                                                     |
| `art/maps/`                    | 大陆图与区域图插画                                         | `map_*`                                                      |
| `art/key/`                     | 宣传主视觉、商店胶囊图底图、纹章                           | `key_*`                                                      |

`audio/` 的子目录（音乐、环境声、音效、界面音）与音频模板的 `outDir` 一一对应，以 `prompts/templates_audio.json` 与 `../docs/40_design/audio_direction.md` 为准。

## 2. 命名

- **编号：** `art_<类>_<主体>[_<部分>][_<朝向或序号>]`（音频为 `mus_`、`amb_`、`sfx_` 前缀，见音频方案）。小写英文、数字与下划线，全库唯一；有内容 ID 的主体直接用内容 ID。
  - 朝向后缀：`_d` 面向镜头、`_r` 朝右、`_u` 背向镜头（左向由右向镜像，不出图）。
  - 参照图后缀 `_ref`；主要角色动作条的后缀是动作名，例如 `art_chr_yeyu_walk`；同一主体的变体用两位序号，例如 `art_tile_lothar_plain_grass_02`。
- **文件名 = 编号加扩展名：** 美术一律 `.png`，音频一律 `.ogg`。文件名里不写日期、人名、版本、`final`、`new` 之类。
- **路径 = 模板的 `outDir` 加文件名**，例：`assets/art/monsters/art_mon_dian_rat_d.png`、`assets/art/characters/art_chr_yeyu_idle.png`。
- **不含剧透：** 编号与文件名随发行包分发，玩家看得到，所以不写正名、身份真相与结局信息（例：门口的女人用 `door_woman`）。
- **含义不变：** 同一编号的含义不变；要改含义就开新编号，旧编号在清单里标为停用。
- **音频的变体与分轨：** 一个编号一个原文件（多个变体依次排在同一文件里，变体之间留 1 秒静音）；处理结果按后缀拆开：分轨 `<编号>_s1.ogg` 到 `_sN.ogg`（对应 L1 到 LN），变体 `<编号>_01.ogg` 起，另有 `<编号>.json` 元数据。没有通过审核的音频编号在游戏里静音，不放占位音（`../docs/40_design/audio_direction.md` 第 9.2 节）。

## 3. 来源登记

### 3.1 素材清单 `manifest.json`

每个原文件一条记录，文件与记录双向一一对应（`tests/art_manifest.test.ts` 校验）。登记用 `npm run assets:register`：它扫描 `art/` 与 `audio/` 下的新文件，按文件名匹配提示词条目，
询问生成工具与日期，自动算哈希、读出原文件元数据里的隐式标识，写入一条状态为 `review` 的记录。命令写入的就是下面的格式，手工登记时照此填写：

```json
{
  "id": "art_mon_dian_rat_d",
  "kind": "art",
  "file": "art/monsters/art_mon_dian_rat_d.png",
  "template": "mon_small",
  "style": "ash_waste",
  "promptHash": "3f9a1c2b7e44",
  "promptLang": "zh",
  "tool": "xiaojiu",
  "toolVersion": "2026-11-20",
  "seed": "",
  "refs": ["art_mon_dian_rat_ref"],
  "generatedAt": "2026-11-20",
  "sha256": "原文件的 sha256",
  "aigcLabel": "原文件元数据里的隐式标识，没有则写 none",
  "converted": false,
  "status": "review",
  "reason": "",
  "reviewer": "",
  "reviewedAt": "",
  "milestone": "M1",
  "notes": ""
}
```

| 字段            | 规则                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `promptHash`    | 条目提示词（中文、英文与反向提示词）的指纹：sha256 前 12 位；`npm run prompts` 的输出里每条都印有"提示词指纹"，照抄即可 |
| `promptLang`    | 用了中文提示词写 `zh`，用了英文写 `en`                                                                                  |
| `tool`          | 必须是 `tools.json` 里登记过的工具编号                                                                                  |
| `toolVersion`   | 工具界面显示的模型或版本名；没有就写生成日期                                                                            |
| `seed`          | 工具显示种子时照抄，否则留空                                                                                            |
| `refs`          | 生成时附上的参照图编号（三视图、风格板、批内参照）                                                                      |
| `converted`     | 工具不能直接下载 PNG（或 OGG）、经过另存转换时写 `true`，并把转换前文件的隐式标识照抄进 `aigcLabel`                       |
| `status`        | `review` 审核中、`approved` 通过、`rework` 返工、`rejected` 淘汰、`retired` 停用                                        |
| `reason`        | 返工与淘汰的原因码（`art_pipeline.md` 第 15.3 节）                                                                      |

### 3.2 工具登记 `tools.json`

每个生成工具一条记录；条款不允许商用或生成物权利不清的工具，不得用于入库素材。

| 字段                 | 内容                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `id`、`name`         | 工具编号与名称（例：`xiaojiu`、小九 AI）                                 |
| `usedVersions`       | 本作用过的模型或版本名                                                   |
| `termsUrl`           | 服务条款链接                                                             |
| `termsCheckedAt`     | 最近一次查阅条款的日期                                                   |
| `commercialUse`      | 条款是否允许把生成物用于商业发行（必须为 `true`）                        |
| `outputRights`       | 条款里关于生成物权利归属的摘要（原文摘录加链接）                         |
| `aigcLabel`          | 工具是否在文件元数据中写入隐式标识，以及标识的格式                       |
| `kind`               | `image`、`audio` 或 `font`（商店图排版用的字体授权也登记在这里）         |

### 3.3 状态流转与回收

- **审核中到通过：** 主审在编辑器的素材浏览器里看过处理结果后设为 `approved`，填 `reviewer` 与 `reviewedAt`。
- **返工：** 导入参数调整或局部修图能解决的，标 `rework` 并写原因码；处理后回到 `review`。
- **淘汰：** 需要重新生成的，标 `rejected` 并写原因码，把原文件移到 `_rejected/<类>/`（不入库）；提示词条目的 `notes` 写清淘汰原因，重新生成后用同一编号登记新文件，旧记录被新记录替换。
- **停用：** 内容被删除或编号改义时标 `retired`，原文件保留，游戏不加载它（解析器只取 `approved`）。

## 4. 处理结果 `processed/`

- `npm run assets:import` 从原文件生成：`processed/<类>/<编号>.png`（量化、描边、对齐后的结果）与 `processed/<类>/<编号>.json`（帧矩形、锚点、动作时长、色样、导入版本、隐式标识与处理记录）。
- 处理是确定性的：同一原文件与同一导入版本得到同一结果；不手改处理结果，要改就调整导入参数或重新生成原文件。
- 图集在构建时由 `npm run assets:atlas` 生成，不入库；未通过审核的美术编号不进图集，游戏里显示程序化占位；未通过审核的音频编号静音。
- 音频的处理（响度归一、重采样、编码、循环点、分轨与变体拆分）由 `tools/audio/pack.ts` 完成，结果在 `processed/audio/<类>/`，规格见 `../docs/40_design/audio_direction.md` 第 8、9 节。

## 5. 许可与合规

| 规则                                   | 说明                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 只放登记过的 AI 生成文件               | 每个文件都有清单记录、对应的提示词条目与已登记的工具；不放手绘稿、截图、下载的图库素材或其他游戏的素材                                     |
| 不放受限素材                           | my_ai_town 的代码、像素图、图标与音乐不得进入，也不得作为参照图（D-017）；主工程的商标、不可再分发的第三方图标、非商用音效不得进入（D-015） |
| 参照图只用本作素材                     | 生成时附的参照图只能是本库里已通过或审核中的本作素材；不得把其他作品的图片交给生成工具作参照                                              |
| 提示词不点名                           | 提示词与条目说明里不出现其他作品、作者、画师、工作室与商标名称，也不写"HD-2D"这个词                                                        |
| 保留隐式标识                           | 生成服务写入原文件元数据的隐式标识不得删除或篡改；原文件按原样保存；处理结果的 PNG 文本块写入同一标识（《人工智能生成合成内容标识办法》）   |
| 原文件不随游戏分发                     | 发行包只含图集与处理结果；原文件与 `_rejected/` 不进发行包                                                                                  |
| AI 内容申报                            | Steam 内容调查申报"预生成内容"（美术、音乐、音效、商店图）与"实时生成内容"（玩家自配大模型的对话）；申报文字草稿在 `art_pipeline.md` 第 6.7 节 |
| 字体                                   | 游戏内用系统字体；商店图排版用的字体在 `tools.json` 登记授权                                                                               |
| 大文件                                 | `art/` 与 `audio/` 下的原文件、`processed/audio/` 下的音频处理结果用 Git LFS 管理；美术的 `processed/` 与清单是普通文件                                                                 |

# 本机音频生成：open-share 的 ComfyUI 环境与乐谱优先试做

> 所属目录：`docs/10_research/open_share/`。本文只记录事实、分析与可借鉴点，不做最终设计决定
> （正典优先级第 6 级，见 `hakoniwa/CLAUDE.md`）。
> 资料来源：本机环境登记 `F:\workspace\open-share\docs\ai-generation\`（`README.md`、`environment.json`），
> 本机 ComfyUI 源码 `E:\AI\ComfyUI_modern`，以及第 7 节列出的模型卡与许可证原文。调研与试做日期：2026-11-17。
> 标注约定："分析"是对《箱庭纪》的推演，不是来源原文。

## 0. 结论

1. 本机已有可用的离线音频生成环境：ComfyUI 0.34.0（RTX 4060 Laptop 8 GB 显存、约 64 GB 内存），
   自带 ACE-Step 1.5、Stable Audio 3、MiniMax Music 3 的本地节点。本次装了 ACE-Step 1.5 turbo（音乐）
   与 Stable Audio 3 Small-SFX（音效与环境声），共约 13.5 GB，全部按官方 LFS 哈希校验。
2. 能商用、8 GB 跑得动、能做循环与分层，三条同时满足的是 ACE-Step 1.5（代码与权重 MIT，模型卡写明生成的
   音乐可商用）与 Stable Audio 3 Small-SFX（Stability 社区许可，年收入低于 100 万美元可商用，需登记）。
   MMAudio 权重为 CC-BY-NC，不可商用；MiniMax Music 3 的许可要求在商业产品界面显著标注其名称。
3. ComfyUI 的 ACE-Step 1.5"参考音频"节点就是翻奏（cover）：参考音频被切成 5 Hz 语义编码，约束旋律、和声
   与结构，音色跟提示词走（第 3 节）。所以"乐谱渲染成小样，再由 ACE-Step 翻奏"可以在本机直接跑。
4. 乐谱优先把[音频方向][audio]第 11.2（循环接缝）、11.3（分轨）、11.8（动机一致性）三处变成可计算的步骤：
   小节网格从乐谱算出，分层本来就是独立的轨，动机就是乐谱里的音符（第 4 节的实测）。
5. 试做的三条（`mus_town_borderstone_day`、`sfx_hit_slash_flesh`、`amb_town_day`）已生成并放进素材审核台；实测见第 5 节，
   听感结论待主审给出。

## 1. 本机环境

| 项 | 事实 |
| --- | --- |
| 运行环境 | `E:\AI\ComfyUI_modern`，ComfyUI 0.34.0，Python 3.10.8，PyTorch 2.11.0+cu130；网页与接口 `http://127.0.0.1:8189`，只允许本机访问 |
| 硬件 | RTX 4060 Laptop，8,188 MiB 显存；约 64 GB 内存，低显存靠内存卸载 |
| 登记 | open-share 的 `docs/ai-generation/environment.json` 与 `README.md`；模型下载回执在 `E:\AI\deployment\20261117\audio-models\` |
| 音频节点 | `comfy_extras/nodes_ace.py`（ACE-Step 1.0 与 1.5）、`nodes_audio.py`（音频读写与 VAE 编解码）、`nodes_minimax_music.py`；Stable Audio 3 由 `comfy/supported_models.py` 的 `StableAudio3` 识别 |
| 乐谱渲染 | FluidSynth 2.6.2（官方 Windows 版，LGPL）与 GeneralUser GS 2.0.3 音色库，放在 `E:\AI\audio_tools\` |
| 编码与响度 | 系统已装的 FFmpeg 8.0.1 |

本次安装的模型（ComfyUI 官方转存仓库，下载回执记录了版本号与哈希）：

| 文件 | 来源仓库 | 大小 | 许可 |
| --- | --- | --- | --- |
| `diffusion_models/acestep_v1.5_turbo.safetensors` | Comfy-Org/ACE-Step-1.5 | 4.79 GB | MIT |
| `text_encoders/qwen_0.6b_ace15.safetensors` | 同上 | 1.19 GB | MIT |
| `text_encoders/qwen_1.7b_ace15.safetensors` | 同上（作曲用的语言模型） | 3.71 GB | MIT |
| `vae/ace_1.5_vae.safetensors` | 同上 | 0.34 GB | MIT |
| `checkpoints/stable_audio_3_small_sfx.safetensors` | Comfy-Org/stable-audio-3 | 2.27 GB | Stability AI 社区许可 |
| `text_encoders/t5gemma_b_b_ul2.safetensors` | 同上 | 1.19 GB | Gemma 使用条款（随 Stable Audio 3 附带） |

ComfyUI 只提供 1.7B 与 4B 两档作曲语言模型（官方建议 8 到 12 GB 用 0.6B），所以装的是 1.7B，靠内存卸载运行。

## 2. 模型筛选

| 候选 | 用途 | 许可（权重） | 8 GB | 结论 |
| --- | --- | --- | --- | --- |
| ACE-Step 1.5 | 音乐，翻奏，局部重做 | MIT；模型卡写明生成的音乐可商用 | 官方有 6 到 8 GB 档 | 采用做试做 |
| Stable Audio 3 Small-SFX | 音效、短环境声，最长 2 分钟 | Stability 社区许可：年收入低于 100 万美元可商用，商用前要在官网登记 | 小到能在 CPU 上跑 | 采用做试做 |
| MiniMax Music 3 | 带词歌曲，最长约 5 分钟 | MiniMax-Music3 社区许可：商业产品界面须显著标注名称，年收入超过 2,000 万美元须另行授权 | 只能逐层卸载慢跑 | 不采用 |
| MMAudio | 给视频配声，也能文生音 | CC-BY-NC 4.0（不可商用） | 约 6 GB | 不采用 |
| Qwen3-TTS、IndexTTS | 配音 | Qwen3-TTS 代码为 Apache-2.0 | 可 | 不需要：D-080 不做配音 |

## 3. ACE-Step 1.5 的翻奏机制（源码事实）

- `TextEncodeAceStepAudio1.5` 直接接收速度、时长、拍号、调性（`keyscale`）与种子；`generate_audio_codes`
  打开时由作曲语言模型先写 5 Hz 音频编码，节点说明写明"给参考音频时关掉"。
- `ReferenceTimbreAudio`（界面名 Set Reference Audio）把一段 VAE 编码的参考音频挂到条件上。
  `comfy/model_base.py` 里有参考音频时置 `is_covers=True`；`comfy/ldm/ace/ace_step15.py` 的
  `prepare_condition` 把参考音频经 `tokenizer.tokenize` 切成 5 Hz 语义编码，再经 `detokenizer` 还原成提示，
  作为生成的上下文。语义编码与时间轴对齐，所以输出与参考同一时间线。
- 采样起点可以是空白隐变量（只靠语义提示），也可以是参考音频本身的编码（`denoise` 小于 1），后者保留更多原音色。
- Comfy-Org 的模型卡注明训练数据含"专业授权曲目、公有领域与免版税音乐、MIDI 转音频的合成数据"（开发方自述，未独立核实）。

## 4. 乐谱优先管线与实测

实现在 `hakoniwa/tools/audio_gen/`（单元测试 `tests/audio_gen_midi.test.ts`）：

| 步骤 | 实现 | 说明 |
| --- | --- | --- |
| 写谱 | `scores/mus_town_borderstone_day.ts` | 按[音频方向][audio]第 2.2 节动机表与第 4.3 节条目：104 BPM、4/4、G 大调、32 小节循环，L1 手摇弦琴持续音与鲁特琴，L2 手鼓与拨奏，L3 木笛旋律与低音暗流 |
| 导出 | `midi.ts`、`score.ts` | 无依赖的 MIDI 写入；整曲与逐层 `.mid`，可在任何音乐软件打开 |
| 渲染 | `render_score.ts` | FluidSynth 把循环连奏两遍再加两小节尾巴，取第二遍作循环体，开头自带上一遍的混响尾巴（第 11.2 节的尾巴回卷） |
| 翻奏与生成 | `comfy.ts`、`pilot.ts` | 经本机接口跑 ACE-Step 与 Stable Audio；提示词直接取提示词库条目 |

渲染实测（`mus_town_borderstone_day`）：

- 循环体 3,544,615 个采样（48 kHz），73.846 秒，与设计的"约 74 秒"一致。
- 三层相加与整曲混音的差为 -59 dB（第 11.3 节要求低于 -30 dB）。逐层渲染与整曲共用同一套人性化时值，测试锁定。
- 接缝处的采样跳变 0.003，低于曲中正常相邻采样变化的 99.9 百分位（0.037），即没有咔哒声。
- 主角动机在第 1、9、25 小节出现，每次停在第二级音 A 上；暗流在两个低音声部里每两拍 D、降 E 交替，贯穿全曲，测试锁定。

## 5. 试做结果

生成记录（模型哈希、种子、提示词与其哈希、耗时、显存峰值、响度）在本机 `hakoniwa/.local/audio_pilot/listen/records.json`；
全部候选已放进候选池 `hakoniwa/assets/_candidates/audio/`，在编辑器的素材审核台里试听与审核（[素材说明][assets]第 3.4 节）。
下表是实测，听感结论待主审给出。

| 条目 | 做法 | 单次耗时 | 显存峰值 | 实测要点 |
| --- | --- | --- | --- | --- |
| `mus_town_borderstone_day` | A 乐谱直出（FluidSynth） | 整曲加三层约 18 秒 | 不用显卡 | 循环与分层精确（第 4 节） |
| 同上 | B 翻奏，从噪声起（两个种子） | 129 秒、78 秒 | 约 7.9 GB（占满，靠内存卸载） | 时间线与小样一致，按同一小节网格切出的循环接缝跳变不超过 0.001 |
| 同上 | C 翻奏，从小样起，改动 0.7 与 0.55 | 252 秒、242 秒 | 约 7.9 GB | 同上 |
| 同上 | D 只用提示词（两个种子） | 75 秒、70 秒 | 约 7.2 GB | 接缝跳变 0.045 与 0.018，不能直接循环，没有分层 |
| `sfx_hit_slash_flesh` | A 提示词库原文，8 条一批 | 约 7 到 9 秒 | 约 3.2 GB | 每条都是单次命中、300 毫秒内衰减 40 dB 以上、尾部干净；250 Hz 以下能量占比中位数 -18 dB，偏亮 |
| 同上 | B 改写提示词（写明闷响、低中频与骨头脆响），8 条一批 | 约 7 秒 | 约 3.2 GB | 250 Hz 以下占比中位数 -2.9 dB，低频成为主体 |
| `amb_town_day` | 120 秒一次生成 | 约 5 到 7 秒 | 约 3.2 到 4.6 GB | 输出是左右相同的单声道（侧声道比中声道低约 52 dB）；2 kHz 以上能量很少，偏暗；改生成时长不改变这点 |
| 同上 | 两次生成分放左右声道 | 约 7 秒 | 约 4.6 GB | 得到宽立体声；90 秒循环体取最安静的接缝，接缝 2 秒等功率交叉 |

几条源码与测量得出的事实：

- **翻奏继承小样的音色。** `ReferenceTimbreAudio` 挂上的参考音频同时进了两处：编码器的音色参考（`refer_audio_acoustic_hidden_states_packed`）与 5 Hz 语义提示。
  所以通用音色库小样的"闷"也被带过去：翻奏版 8 kHz 以上的能量占比约 -44 到 -48 dB，只用提示词的版本约 -22 到 -26 dB。
  要两头兼得，可选的办法是：换来源清楚、音色更好的采样音色库渲染小样；或写一个 ComfyUI 节点，把语义参考与音色参考分开（音色用一段只用提示词生成的好听片段）。
- **提示词库的音效条目需要按模型习惯改写。** 同一事件，照库里原文生成的偏亮偏薄，写明质感与频段后低频成为主体；改写不改编号与主体，属于条目的 `extra`。
- **Small-SFX 输出单声道。** 宽立体声的环境底层要两次生成拼左右，或换成 Stable Audio 3 Medium（另需下载约 9.2 GB，未装）。
- **速度。** 音效与环境声在这台机器上以秒计，可以整批无人值守；音乐翻奏每条 1 到 4 分钟，显存占满，适合夜间批量。

### 5.1 全量生成

用户试听后认可这几种做法（2026-11-17），全部 1,214 条音频转入批量生成：`node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/batch.ts`
（`--milestone`、`--kind`、`--only`、`--limit`、`--dry-run`、`--force`；状态在 `hakoniwa/.local/audio_batch/state.json`，已有候选的编号跳过，可断点续跑）。

| 条目 | 做法 | 候选 |
| --- | --- | --- |
| 音效与界面音 | Stable Audio 3 Small-SFX，变体数的 1.5 倍（至少 4、至多 10），每条裁到起音、峰值 -1.5 dBFS | 采用时按条目的变体数顺序拼接 |
| 循环音效 | 同上，14 秒生成，取 4 到 8 秒循环体，最安静处接缝，200 毫秒交叉 | 3 条 |
| 环境底层 | 两次 120 秒生成分放左右声道，两组，按条目的循环体长度裁切，2 秒交叉，-26 LUFS | 2 版 |
| 环境点缀 | 同音效 | 按变体拼接 |
| 循环曲、过场曲、片尾、短乐句 | ACE-Step 1.5 只用提示词，按条目的速度、调性（教会调式按三音归大小调）、拍号、时长；循环曲生成循环体的 1.6 倍，接缝在导入时切；生成出静音的一版自动换种子重试 | 2 版 |
| 动机种子 | 按动机表逐音写成乐谱（`tools/audio_gen/scores/motif_seeds.ts`），乐谱直出一版，再加 ACE-Step 翻奏一版 | 2 版 |

顺序是 M1、M2、M3，每个里程碑内先音效与环境声（每条几秒到半分钟），再音乐（每条 1 到 14 分钟，越长越慢）；全量约 15 小时。
180 秒以上的音乐分块解码（`VAEDecodeAudioTiled`，每块约 41 秒、重叠约 5 秒）：8 GB 显卡整段解码 330 秒的片尾曲会溢出到共享内存，一版要三个多小时，分块只要一分钟左右。单个任务 30 分钟没完成就从 ComfyUI 队列撤掉并记为失败，免得后面的任务排在它后面连环超时；失败的条目没有候选，再跑一次批处理就会补上。
Stable Audio 的候选要等社区许可登记后（`assets/tools.json` 的 `commercialUse` 改为 `true`）才能采用。

## 6. 对现计划的影响（分析）

- [决策日志][dlog] D-080 写"音乐、环境声、音效全部 AI 生成，由用户在小九 AI 生成"。本机路线不改变"AI 生成"这一点，
  改变的是工具与工作流：生成在本机批量无人值守运行，用户的工时集中在试听挑选。是否修订 D-080，要等试听结论。
- [开发计划][plan] PK-M0-05（生成工具条款核实）要补登 ACE-Step 1.5 与 Stable Audio 3 的许可，并办理 Stability 社区许可登记；
  PK-M0-11 的音频三条可以用本次试做的文件走导入与校验。
- 本机生成不经过服务方，不会自动写入隐式标识；[音频方向][audio]第 12.3 节的标识要求需要改成在登记与文件元数据里自行写入，
  具体合规口径随 PK-M0-05 一并确认。
- GeneralUser GS 的许可允许把用它做出的音乐商用，但作者说明部分采样来源无法逐一追溯；若乐谱直出的版本要作为成品，
  建议换成来源清楚的音色库，或只把它当翻奏的骨架。

## 7. 来源

- ACE-Step 1.5：<https://github.com/ace-step/ACE-Step-1.5>；模型卡 <https://huggingface.co/ACE-Step/Ace-Step1.5>；ComfyUI 转存 <https://huggingface.co/Comfy-Org/ACE-Step-1.5>
- Stable Audio 3：<https://docs.comfy.org/tutorials/audio/stable-audio/stable-audio-3>；模型卡 <https://huggingface.co/stabilityai/stable-audio-3-small-sfx>；ComfyUI 转存 <https://huggingface.co/Comfy-Org/stable-audio-3>
- MiniMax Music 3 许可：<https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE>
- MMAudio：<https://github.com/hkchengrex/MMAudio>
- Qwen3-TTS：<https://github.com/QwenLM/Qwen3-TTS>
- FluidSynth：<https://github.com/FluidSynth/fluidsynth/releases/tag/v2.6.2>；GeneralUser GS：<https://github.com/mrbumpy409/GeneralUser-GS>

[audio]: ../../40_design/audio_direction.md
[assets]: ../../../assets/README.md
[dlog]: ../../00_vision/decision_log.md
[plan]: ../../60_production/development_plan.md

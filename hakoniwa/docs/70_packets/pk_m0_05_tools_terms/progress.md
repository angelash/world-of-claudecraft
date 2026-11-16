# PK-M0-05 生成工具能力与商用条款核实：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-16 | 立项 | 建包目录：核实清单、`tools.json` 的登记格式与编号约定 | 见提交记录 | 文档守卫 | 用户按 `README.md` 第 12.1 节核实，代理登记并写决策 |

## 2. 汇报

### 2026-11-16 立项

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `docs/70_packets/pk_m0_05_tools_terms/README.md` | 新增 | 包简报、用户核实清单、登记格式 |
| `docs/70_packets/pk_m0_05_tools_terms/verification_matrix.md` | 新增 | 验收条目，全部 VERIFY |
| `docs/70_packets/pk_m0_05_tools_terms/progress.md` | 新增 | 本文件 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| [art_pipeline.md](../../50_tech/art_pipeline.md) 第 6.5 节；[audio_direction.md](../../40_design/audio_direction.md) 第 12.2 节 | 美术方案以 `xiaojiu` 为工具编号；音频方向写小九 AI 以 `kind` 为 `audio` 登记 | 图像 `xiaojiu`，音频 `xiaojiu_audio`，两条记录 | `ToolRecord.kind` 只取一个值且 `id` 不可重复，同一工具出图出声要两条 | 否 |

**观察**

| 事项 | 内容 |
| --- | --- |
| 现有原图的元数据 | `assets/art/` 下 30 个未登记的 PNG 用 PNG 块解析逐个检查，都没有 `tEXt`、`iTXt`、`zTXt`、`eXIf` 块，也就没有隐式标识。不能据此断定小九 AI 不写标识：文件可能经过另存或转换。核实清单第 12.1 节第 5 项需用一张刚从小九 AI 下载、没有经过任何软件另存的原图复核；若原图确实带标识而这批丢了，这批不能入库，需按原样重新下载 |
| 基线失败 | `tests/art_manifest.test.ts` 因这 30 个未登记文件失败，与本包无关（`verification_matrix.md` 第 4 节） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 商店图排版字体的选定与登记 | 本包第 11 节第 2 项；最迟 PK-M3-03 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 在小九 AI 账户里查条款并实测能力 | 按 `README.md` 第 12.1 节；截图放 `evidence/` 或把结论贴给代理 | 阻塞 |

**下一步与恢复方式**

1. 用户交回核实结果后：代理写 `assets/tools.json`（第 12.2 节格式），跑 `tests/art_manifest.test.ts` 与 `npm run assets:check`，在决策日志新增一条，填本包验收矩阵。

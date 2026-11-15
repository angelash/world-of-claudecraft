# tools/：开发服务与工具

| 文件 | 内容 |
|---|---|
| `dev_api.ts` | Vite 开发服务插件：`/api/llm`（模型代理）、`/api/llm/status`、`/api/data`（编辑器读写 `data/`）、`/api/audit`（审计日志） |
| `llm_proxy.ts` | 用官方 Claude SDK 调用模型（只在服务端，密钥不进浏览器） |
| `data_paths.ts` | `data/` 路径解析与防路径穿越、JSON 写盘格式 |
| `refs/fetch_refs.ts`、`refs/manifest.json` | 开源参考源码镜像：清单记录每个仓库的固定提交、许可与稀疏目录；工具把只读镜像拉到仓库外（`npm run refs -- --dir D:/hakoniwa_refs`），说明见 `docs/10_research/open_source/README.md` 第 5 节 |
| `prompts/build.ts` | AI 素材提示词库：校验 `assets/prompts/` 的模板（`templates.json`、`templates_audio.json`）与条目（`specs/*.json`），展开为逐条可复制的提示词、表格与预期素材清单 `assets/prompts/out/`（`npm run prompts`；`npm run prompts:check` 只校验并确认 `out/` 是最新的），说明见 `assets/prompts/README.md` |
| `gate.ts`、`gate/` | 本地全量门：禁用字符扫描、改动文件的 Biome 检查、类型检查、测试、提示词库核对、构建，`--full` 另跑无模型通关；每步失败不中断，最后汇总各步退出码与耗时（`npm run gate`）；提交流水线 `.github/workflows/hakoniwa-ci.yml` 在 `hakoniwa/` 改动时运行它 |

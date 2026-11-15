# tools/：开发服务与工具

| 文件 | 内容 |
|---|---|
| `dev_api.ts` | Vite 开发服务插件：`/api/llm`（模型代理）、`/api/llm/status`、`/api/data`（编辑器读写 `data/`）、`/api/audit`（审计日志） |
| `llm_proxy.ts` | 用官方 Claude SDK 调用模型（只在服务端，密钥不进浏览器） |
| `data_paths.ts` | `data/` 路径解析与防路径穿越、JSON 写盘格式 |
| `refs/fetch_refs.ts`、`refs/manifest.json` | 开源参考源码镜像：清单记录每个仓库的固定提交、许可与稀疏目录；工具把只读镜像拉到仓库外（`npm run refs -- --dir D:/hakoniwa_refs`），说明见 `docs/10_research/open_source/README.md` 第 5 节 |

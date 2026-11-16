# tests/：测试

- `npm test`：默认套件（内核确定性与重放、架构守卫、各系统规则、AI 层、客户端纯逻辑、编辑器纯逻辑、内容校验）。
- `npm run playthrough`：`playthrough/` 下的无模型通关测试（自动玩家从序章玩到结局，并检查回放一致性），对应决策 D-010 的硬性验收，较慢，不在默认套件中。
- 测试文件按系统命名（`<系统>.test.ts`、`client_*.test.ts`、`editor_*.test.ts`、`ai*.test.ts`、`llm_*.test.ts`、`desktop_*.test.ts`、`platform_*.test.ts`、`settings_*.test.ts`）。
- 桌面壳与平台接口的测试不启动 Electron：`desktop_fakes.ts` 是假 Electron（主进程、窗口、会话、协议），`platform_fakes.ts` 由真正的 `createHkBridge` 搭出假 `window.hk`，另有可模拟配额满的假本地存储与最小的假 IndexedDB。
- 大模型适配器的夹具在 `fixtures/llm/`（规格与模型档案）、`fixtures/llm_golden/`（请求体金样，`HK_WRITE_LLM_GOLDEN=1` 重写后逐行审阅）、`fixtures/llm_cassettes/`（各提供方的应答样例）。
- 存档容器的夹具在 `fixtures/save_container/`：`act6_release.hks` 是离手路线进入第六幕时的世界快照（gzip JSON，约 130 KB），由 `node tools/replay/run.ts record --dir <临时目录> --until act6 --fixture tests/fixtures/save_container/act6_release.hks` 生成；它只用于容器读写与体积预算，不随内容批次重生成，世界结构变化后的迁移样本归 `fixtures/saves/`（PK-M0-18）。
- `save_container.test.ts`（容器、断电注入、云冲突、回退、旧存档迁入）与 `replay_segments.test.ts`（短路线 40 次存档与锚点回放、回放工具命令行）在默认套件；完整路线上的同一检查是 `playthrough/replay_segments.playthrough.test.ts`（离手路线中途存档 40 次以上，进程内逐段回放加一次中间锚点到终点，单文件约 35 分钟）。

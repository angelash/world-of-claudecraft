# tests/：测试

- `npm test`：默认套件（内核确定性与重放、架构守卫、各系统规则、AI 层、客户端纯逻辑、编辑器纯逻辑、内容校验）。
- `npm run playthrough`：`playthrough/` 下的无模型通关测试（自动玩家从序章玩到结局，并检查回放一致性），对应决策 D-010 的硬性验收，较慢，不在默认套件中。
- 测试文件按系统命名（`<系统>.test.ts`、`client_*.test.ts`、`editor_*.test.ts`、`ai*.test.ts`）。

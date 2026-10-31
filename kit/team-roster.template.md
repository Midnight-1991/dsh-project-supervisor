# 团队名册（角色卡）

> 用途：主管派发前先查名册；有匹配的 inactive 成员就 `send_message` 唤醒，不新 spawn。
> 位置约定：`.dsh/team-roster.md`（每个工作区一份；安装器只补缺失、从不覆盖）。
> 名额上限：DSH 包默认 `maxMembers=16`；本机 profile 若另设则以 profile 为准。roster 只增不减，请按角色规划席位。

| 席位 | 成员名（kebab-case） | 职责边界 | 允许写范围 | 最近任务 | 唤醒前必读 | 健康检查句 |
|---|---|---|---|---|---|---|
| 1 | kit-engineer | 套件/脚本/分发（sync/build/selftest/安装器） | setup/ | | AGENTS.md、setup/README | 「当前套件版本与最近一次回归结果？」 |
| 2 | patch-engineer | DSH 补丁/插件 host/兼容性 | plugin/、patch 相关 | | AGENTS.md、插件 README | 「本机 DSH 版本与补丁状态？」 |
| 3 | reviewer-accept | 独立评审（第二意见） | research/评审报告 | | 被评审文件 + 规则 | 「本次评审对象与验收标准？」 |
| 4 | reviewer-beginner | 零基础/可用性评审 | 评审报告 | | 同上 | 同上 |
| 5 | researcher-a | 调研（主题 A） | research/ | | AGENTS.md、问题清单 | 「上次调研结论与未解问题？」 |
| 6 | researcher-b | 调研（主题 B） | research/ | | 同上 | 同上 |
| 7 | ui-engineer | 面板/前端 | plugin/.../client.js 等 | | AGENTS.md、e2e 脚本 | 「当前 UI 版本与 e2e 结果？」 |
| 8 | verifier | 回归/e2e/打包校验 | 只读 + 测试产物 | | selftest/build 说明 | 「最近一次全量回归数字？」 |

## 唤醒协议
1. 读本名册 → 2. `list_agents` 看真实可用性 → 3. `send_message` 粘贴 warm-start 模板（`templates/wake-brief.md`）→ 4. 收到「对齐摘要」并主管确认后再派活。

## 维护
- 成员不可重命名/删除；失败成员占坑直到会话结束。席位按项目长期角色规划。
- 每完成一轮，在 `.dsh/team-ledger.md` 记一笔；同成员连续 3 次任务或规则大改后先做版本重对齐。

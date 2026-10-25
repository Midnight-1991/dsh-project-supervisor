# 第三方组件与许可证声明（THIRD_PARTY_NOTICES）

本文件随「项目主管」安装包（`project-supervisor-kit-<日期>.zip`）分发。再分发、修改或打包时，请保留本文件及各许可证全文；只复制技能目录时，至少保留该目录下的 `LICENSE`。

## 一、本套件自身的许可

「项目主管」套件中除下述第三方组件外的全部文件（规则、技能、手册、脚本、可选 DSH Web 插件等）采用 MIT 许可：

```text
Copyright (c) 2026 dsh-project-supervisor contributors
```

MIT 全文见分享包根目录的 `LICENSE`（维护者仓库中位于 `setup/LICENSE`）。

## 二、第三方组件清单

| 组件 | 快照 / 版本 | 上游 | 许可证 | 版权 | 包内位置 |
|---|---|---|---|---|---|
| improving-prompts（提示词润色技能） | 上游 `main`，2026-10-24 获取 | <https://github.com/theultimate-dev/skills/tree/main/skills/prompt-engineering/improving-prompts> | MIT | Copyright (c) 2026 Igor Wnek | 工作区 `.dsh/skills/improving-prompts/`；安装包模板 `skill-improving-prompts/`；安装后落到 `<工作区>/.dsh/skills/improving-prompts/`，`--global-skill` 时另复制到 `~/.dsh/skills/improving-prompts/` |
| superpowers（工作流机制参考，非代码分发） | 上游 `main`，2026-10-25 阅读（231 文件 / 15 个技能） | <https://github.com/obra/superpowers> | MIT | Copyright (c) 2025 Jesse Vincent | 不随包分发其代码；仅 `research/09-superpowers-learning.md` 的学习笔记与本套件规则/模板的独立改写（见第四节） |

除 improving-prompts 外，本套件不包含其他第三方源代码或素材；superpowers 仅作为工作流机制参考（见第四节），**未复制其代码或长段原文**，规则与模板为本项目独立撰写。以下软件只在运行/安装时由你的机器提供，不随包分发，各自遵循其自身许可证：

- DeepSeek Harness（`dsh`）及其 Web profile；
- Node.js（可选 UI 插件与 smoke 脚本使用）；
- Python 3（**仅**维护者仓库的同步/打包脚本与可选权限补丁使用；安装器 `install-supervisor.*` / `install-plugin.*` 不需要）；
- bash、`zip`/`unzip`、`shasum` 或 `sha256sum`（安装、校验、打包使用）。

## 三、improving-prompts

### 3.1 来源与包含的文件

- 上游仓库：<https://github.com/theultimate-dev/skills>
- 上游技能目录：<https://github.com/theultimate-dev/skills/tree/main/skills/prompt-engineering/improving-prompts>
- 上游许可证原文（MIT）：<https://raw.githubusercontent.com/theultimate-dev/skills/main/LICENSE>（2026-10-24 获取，HTTP 200）
- 包内文件：
  - `SKILL.md`（本地改编版，见 3.2）
  - `LICENSE`（上游 MIT 原文，逐字节保存）
  - `references/` 共 14 个 `.md`：`agent-tasks.md`、`clarity-and-structure.md`、`context-packaging.md`、`decomposition.md`、`diagnosis.md`、`examples.md`、`model-family-notes.md`、`output-control.md`、`reasoning.md`、`reliability-and-grounding.md`、`sources.md`、`system-prompts.md`、`trust-boundaries.md`、`worked-examples.md`
  - `templates/` 共 2 个 `.md`：`improvement-report.md`、`prompt-skeleton.md`

`references/` 与 `templates/` 是上游文件的原样副本，未做改写；`SKILL.md` 正文保留上游结构，另加了本机集成说明（见 3.2）。2026-10-24 抽样核验与上游 `main` 逐字节一致：

```text
a38fbaae4a840f3b82fc5facebb07d2f8996d414430ff7749ca1a9bee786e8a6  references/diagnosis.md
d8e665511dc0edd5c7031ac5a446946538d0f598c10082446e31cdaa4f029fb9  references/model-family-notes.md
895765feef00cf0e9d7410286556abba77377b0b4df50659c90f978958097fd4  templates/prompt-skeleton.md
```

### 3.2 改编说明

在保留上游正文结构与全部 `references/`、`templates/` 内容的前提下，本套件对 `SKILL.md` 做了以下本地改编：

1. **frontmatter 扩展**：扩写 `description`（说明「润色后同轮执行」与粘性模式）；新增 `whenToUse`（中文触发场景）；新增 `metadata`（上游地址、上游许可证、安装来源、安装日期、与主管 `promptPolish` 开关的联动）；新增 `user-invocable: true`。
2. **正文新增两节**：`## Act on the result`（把增强提示词当作任务，在同一轮立即执行；说明不行动的情形）与 `## Sticky session mode`（在同一对话内说「润色并执行 / 开启润色模式」后持续生效，直到显式退出）。
3. **末尾新增中文 `## Local notes（本机安装说明）`**：安装位置、与主管开关 `.dsh/supervisor.config.json` 的 `promptPolish` 联动、报告语言、占位符规则、单次跳过与粘性模式的约定等。

改编版仍按 MIT 许可分发，版权归原权利人 Igor Wnek；本套件不对上游内容主张额外限制。安装包里的 `skill-improving-prompts/SKILL.md` 由维护脚本 `sync-kit.sh`（维护者仓库 `setup/` 下）从工作区副本生成，请勿手改该模板副本。

### 3.3 MIT 许可全文（英文原文）

```text
MIT License

Copyright (c) 2026 Igor Wnek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 四、superpowers（工作流机制参考）

### 4.1 来源与使用范围

- 上游仓库：<https://github.com/obra/superpowers>（MIT）
- 上游许可证：<https://raw.githubusercontent.com/obra/superpowers/main/LICENSE>（2026-10-25 获取，HTTP 200）
- 阅读范围：`README.md`、`AGENTS.md`、`skills/` 下 15 个 `SKILL.md`（brainstorming、writing-plans、subagent-driven-development、test-driven-development、systematic-debugging、dispatching-parallel-agents、verification-before-completion、using-git-worktrees、requesting-code-review、receiving-code-review、finishing-a-development-branch、writing-skills、executing-plans、using-superpowers、diagnosing-superpowers）、`hooks/session-start` 与部分参考文件；未运行其代码。
- 产出：`research/09-superpowers-learning.md`（14 条可迁移机制的独立摘要与逐条落点，含上游链接）。
- 使用方式：**只借鉴流程思想**（计划落文件、实现/评审分离、完成声明过验证门、返工有上限、裁决进账本、技能自动触发等），14 条规则与 `templates/` 四个模板均为本项目独立撰写；**未复制上游源代码、未整段搬运其 `SKILL.md` 文本**。
- 引用要求：再分发本套件或其改写版时，请保留本节、上游链接与下述 MIT 许可全文；若未来复制上游任何代码或长段文本，必须在该副本中同时保留其版权声明与 MIT 全文。

### 4.2 MIT 许可全文（superpowers，英文原文）

```text
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 五、合规检查清单（打包/再分发前）

- [ ] 分享包内含 `LICENSE`、`THIRD_PARTY_NOTICES.md`、`skill-improving-prompts/LICENSE`。
- [ ] `skill-improving-prompts/references/` 为 14 个 `.md`，`templates/` 为 2 个 `.md`，与上游快照一致。
- [ ] 若更新了上游文件，重跑 `bash setup/sync-kit.sh` 并在本文件记录新的获取日期与核验哈希。
- [ ] 不删除或改写任何版权行与许可全文。
- [ ] `research/09-superpowers-learning.md` 保留上游链接与「MIT © 2025 Jesse Vincent」声明；若复制了上游代码/长段文本，额外保留其版权行与 MIT 全文。
- [ ] 公开仓库 README 的「许可证与第三方」节包含 superpowers 致谢与 `THIRD_PARTY_NOTICES.md` 链接。

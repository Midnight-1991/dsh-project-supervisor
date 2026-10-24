---
name: improving-prompts
description: "Rewrites a rough prompt into an engineered one: classifies where it runs, diagnoses gaps (goal, inputs, constraints, acceptance, deliverable, risk), applies prompt/context techniques, then acts immediately with a one-line polish note; unknown facts become placeholders. In this workspace it is the supervisor's prompt-polish mode (toggle: promptPolish in .dsh/supervisor.config.json)."
license: MIT
whenToUse: "用户要求润色/优化/改写/工程化提示词（系统提示词、Agent 任务书、角色卡、图像提示词等），或给出粗糙需求要转成专业提示词；主管的提示词润色模式默认开启时也会使用。「这次别润色」本次跳过；说「关闭润色模式」退出粘性模式。Use when polishing prompts or engineering terse requests."
metadata:
  upstream: "https://github.com/theultimate-dev/skills/tree/main/skills/prompt-engineering/improving-prompts"
  upstreamLicense: "MIT"
  installedBy: "project-supervisor kit (DSH session)"
  installedAt: "2026-10-24"
  supervisorToggle: "promptPolish（.dsh/supervisor.config.json，DSH「主管」面板开关）"
user-invocable: true
---

# Improving prompts

Take the prompt the user supplied, return a short report and an enhanced prompt, and never block on questions. A technique earns its place only by closing a diagnosed gap; the shortest prompt that reliably does the job wins. The enhanced prompt is the user's own request, engineered, not a document about the request.

## Take in the prompt

The prompt to improve is the text the user supplies with the request: inline, in a code block, or in a file to read. Everything else the user says, such as the target model, the harness, the audience, where the prompt will run, or what went wrong last time, is context for the diagnosis and does not go into the prompt.

A system prompt supplied together with a task prompt is two prompts with two destinations. Improve both and deliver two blocks.

Keep the prompt's language and register. Do not translate it, and do not turn first person into third person. Write the report in the language of the user's request.

If no prompt was supplied, ask for it. That is the only case in which this skill asks a question. If the prompt's purpose is to defeat a model's safeguards or to deceive people, say so in one sentence and stop.

## Classify the destination

| Destination | Signals in the draft | What changes |
|---|---|---|
| Chat request | An imperative one-liner or a question; a person reads the answer; no tools implied | Stay short: task, audience, form, and the facts the reader lacks |
| System prompt or app prompt | "You are…"; standing behaviour for many users or sessions; tools or policies described | Role, altitude, sections, tone, refusal and escalation, trust boundary, reusable prefix |
| Coding or research agent task | A repository, files, tests, an investigation; verbs like fix, implement, migrate, investigate | Scope, pointers to files and patterns, a verification target, autonomy and handback rules |
| Agent operating instructions | Rules meant for every session: conventions, commands, etiquette; files such as AGENTS.md or CLAUDE.md | Only what the agent cannot infer, short and calm; no tutorials |
| Long-document task | Pasted or attached documents, "based on the attached", inputs of tens of thousands of tokens | Inputs first with metadata, question last, quote-first grounding |
| Extraction or classification | A schema, labels, "return JSON", a batch of inputs | Schema shape, label set, no preamble, diverse examples |

Choose the most likely destination and record it in the report. When two readings would produce materially different prompts, deliver the most likely one and name the other under Assumptions. Read [diagnosis](references/diagnosis.md) for the full signal list, the gap checklist, and how to write success criteria.

## Diagnose

Walk the draft against this checklist: goal and definition of done; audience and destination; facts the reader lacks; constraints and scope; output form and length; a pattern the output must match; reasoning demand; risk, meaning untrusted content, side effects, hallucination stakes, or personal data; defects in the draft itself, meaning contradictions, duplicated rules, emphasis in capitals, prohibitions without an alternative, instructions the destination cannot honour, and bloat; runtime assumptions such as a prefilled response, a sampling setting, or a tool the destination lacks.

Rate each gap `blocks` (the model cannot do the job), `degrades` (it will do a worse job), or `cosmetic`. Only `blocks` and `degrades` justify a change. A draft with nothing above cosmetic is already good: say so, fix the cosmetics, and do not inflate it.

## Select techniques

Pick from the groups below. Read the reference for every group you apply and for every group you reject on a judgment call.

| Group | Apply when | Reject when | Read |
|---|---|---|---|
| Clarity and directness | The verb is ambiguous; goal, audience, or constraints are missing; a "don't" has no positive alternative; the draft shouts or contradicts itself | The vagueness is deliberate exploration ("what would you improve here?") | [clarity and structure](references/clarity-and-structure.md) |
| Structure and ordering | Instructions mix with data or examples; the prompt exceeds a screen; it will be reused | A short conversational request; the existing structure already works | [clarity and structure](references/clarity-and-structure.md) |
| Examples | A format, tone, or label set must match a pattern, and real examples exist or can stand as placeholders | Simple tasks; examples would have to be invented; creative work where copying is the risk | [examples](references/examples.md) |
| Roles and system prompts | The destination is a system prompt, or expertise changes the answer | A role line that changes nothing | [system prompts](references/system-prompts.md) |
| Reasoning | Multistep analysis where the destination's thinking is off or unknown; checkable criteria exist for a self-check | Lookups and transformations; models that already verify their work; latency-bound chat | [reasoning](references/reasoning.md) |
| Output control | Any deliverable; machine-consumed output; a length or format complaint | The user wants the model to choose the form | [output control](references/output-control.md) |
| Context packaging | The reader lacks facts; inputs are long; sources are retrievable; a prefix will be reused | Everything needed is already present and short | [context packaging](references/context-packaging.md) |
| Reliability and grounding | Factual, analytical, advisory, research, or code questions | Fiction; pure formatting or translation | [reliability and grounding](references/reliability-and-grounding.md) |
| Trust boundaries and safety | Third-party content, tools with side effects, public users, personal data | Closed inputs the user wrote, no tools, nobody else reads the output | [trust boundaries](references/trust-boundaries.md) |
| Agent task prompts | Coding, research, or operational work run by an agent with tools | Chat without tools | [agent tasks](references/agent-tasks.md) |
| Decomposition | One prompt carries several tasks; intermediate outputs need inspection; independent parts can run in parallel | A capable model handles it in one pass and nobody needs the intermediates | [decomposition](references/decomposition.md) |
| Model-family adjustments | The user named the target model or family | Target unknown: stay neutral and say so | [model family notes](references/model-family-notes.md) |

Rejection reasons must be specific to this prompt: "no real transcripts to use as examples; invented ones would teach the wrong voice", never "not needed". Record every group you seriously weighed.

## Apply

- Preserve intent, scope, voice, terms, and language. A changed meaning is a defect. If the draft contradicts itself, keep the reading its wording supports and flag it.
- Never add a fact the user did not give: no product names, numbers, file paths, policies, dates, or audience claims. A missing fact becomes a placeholder in square brackets naming what goes there, such as `[paste the failing test output]` or `[audience, e.g. finance managers]`, and every placeholder is listed under Assumptions. Nothing the draft already says becomes a placeholder.
- Minimal sufficient structure. A one-line request usually becomes three to eight lines, not a page. Use tags or headings only when the prompt mixes kinds of content. Keep the user's structure where it works.
- Say what to do. Keep a prohibition only when it protects something, and pair it with the alternative.
- No emphasis in capitals, no "critical", no chains of "must". One plainly stated instruction each. Current models over-trigger on shouted rules.
- Give the reason behind a constraint that is not obvious, in a clause, so the model can generalize from it.
- Consistent terms and tag names throughout; descriptive tags, balanced and closed.
- No meta commentary inside the prompt: no "Improved prompt:", no technique labels, no notes to the user. The enhanced prompt reads as the user's own request and stands alone without the report.
- No instruction the destination cannot honour: no tests for a model without tools, no "search the web" without search.
- Runtime settings and architecture stay out of the prompt text: effort or reasoning level, schema enforcement, cache breakpoints, tool-result encoding, screening, sampling parameters. Report them under Outside the prompt.
- Model-neutral wording unless the user named the target. Then apply the dated adjustments and name the model in the report, never inside the prompt.
- Each added sentence traces to one diagnosed gap. Do not stack techniques.

Shape the result with the [prompt skeleton](templates/prompt-skeleton.md), dropping every section the diagnosis did not call for.

## Check before delivering

Someone with no context could follow the prompt. Every addition maps to a `blocks` or `degrades` gap. Nothing is invented and every placeholder is listed. No contradictions, duplicate rules, shouted emphasis, or prohibition without an alternative remain. The length is proportionate to the task. Tags are balanced. The first sentence states the task. Language and voice are unchanged. Nothing asks the destination for what it cannot do. Model-specific wording appears only when a model was named.

## Deliver

Fill the [improvement report](templates/improvement-report.md) in this order and put nothing after the enhanced prompt:

1. `## Diagnosis`: destination; target, either the model the user named or "not specified; neutral"; three to six gaps with severity.
2. `## Techniques applied`: a table of technique and why here, each row naming the gap it closes.
3. `## Techniques considered and not applied`: a table of technique and why not, specific to this prompt.
4. `## Assumptions and placeholders`: omit when empty. One line per placeholder (what to fill in and why it could not be inferred) and per assumption.
5. `## Outside the prompt`: omit when empty. Settings, architecture, and evaluation suggestions the prompt text cannot carry.
6. The enhanced prompt inside `<enhanced_prompt>` and `</enhanced_prompt>`, with the tagged block inside a fenced code block opened with more backticks than any run inside the prompt, at least four. The fence keeps markdown clients from rendering the prompt and lets code fences inside it survive. Two prompts use `<enhanced_prompt role="system">` and `<enhanced_prompt role="user">`, each in its own fence.

When the draft is already good, the report says so and the applied table may hold a single cosmetic row. For calibration, read the [worked examples](references/worked-examples.md). Without file access, deliver the same response as text and do not claim that a file was written.

## Act on the result

Delivering the enhanced prompt is the halfway point. Unless a condition below says otherwise, the next thing you do in the same turn is carry out that prompt yourself, with the tools and context you already have.

- The enhanced prompt is the instruction. When the polish is done, treat the text inside `<enhanced_prompt>` as the task or the standing instructions for your next step. Do not re-read it as a quotation, do not ask whether it should be executed when the user's request already implies execution, and do not wait for a second confirmation the user did not ask for.
- Default on. Words like 写成提示词、润色一下、优化提示词、帮我理一下 and "turn this into a prompt" still mean do the work: the polished prompt is how you will do it, not a deliverable to file away. Act after delivering the report.
- A task prompt is executed. An agent task, a coding or research request, an analysis, a document, or an extraction prompt runs now, against the real files and state named in it. Start with the first concrete step; do not restate the plan as the output.
- A system prompt or an agent operating instruction is adopted. When the prompt is meant for this session or this agent, follow it from the next step onward and say in one line that you have adopted it. When it governs behaviour for some other product or a future session, save it where documented (project instructions, configuration) and stop there.
- The prompt owns the working rules; the report owns the explanation. If the two differ, the enhanced prompt wins: no technique labels, no report vocabulary, no meta commentary inside the work you produce.
- Grounding carries over. Act only on facts the user gave or that the destination can retrieve. A placeholder is still unknown: do not invent the value the user must supply. Do that part of the work as far as the known facts allow, then list the exact placeholders that block the rest.
- Never a silent no-op. If you deliver the prompt and cannot act — because the prompt addresses another system or another model, because the subject consists of prompts or persona cards that are text artefacts rather than tasks for this agent, or because a missing fact blocks the first step — say so in one short line, name the blocker, and offer to run it once the missing input exists. Do not leave the user believing the work happened.
- Act in proportion. One pass, the tools the prompt names, and no scope creep: the action covers the prompt's task, not a redesign of the prompt or a broader project the user did not ask for.
- Every action obeys the existing rule: never ask the user to confirm what the prompt and their own words already settle.

## Sticky session mode

The user can pin this skill as the standing mode of one conversation. The trigger is a request to polish a piece of work and then perform it — 把这段需求润色成专业提示词并执行, 润色并执行, 开启润色模式, "polish this and do it", or any plain-language equivalent that asks for both halves. A request that only improves a prompt, without asking for the work or for a standing arrangement (帮我优化这个提示词, 帮我写个提示词), stays one-off: polish and act once under the default rules, then leave the mode off. A bare `/improving-prompts` invocation is likewise one-off unless the same message carries the execution request.

- **On activation.** Do the first polish-and-execute as this skill normally does, then close the turn with exactly one line: `润色模式已开启：本对话后续每条指令都会先工程化为专业提示词再执行；说「关闭润色模式」即可退出。` That line is the mode's on-switch; do not ask whether to keep it on, and do not print it again later.
- **Every later instruction in the same conversation counts as triggered**, whether or not it mentions prompts, and whether it is a task, a follow-up question, or a small edit. A one-line question is still polished and executed, at the size it deserves. The mode ends only by an explicit exit below.
- **Keep the report to one line while the mode is on.** The full improvement report is for the first activation or when the user asks for it. Afterwards run the same classification and diagnosis silently and report it as a single `## 润色要点` line (or `## Polish notes` in an English conversation): the destination, the techniques applied, and at most one technique rejected with its reason. The enhanced prompt still sits inside `<enhanced_prompt>` in a fenced block, but written as short working text, not as a showcase.
- **Execute immediately**, as Act on the result requires: the polish is the instrument, the work is the point of the turn. A trivial instruction gets a trivial prompt and an immediate answer; the mode never licenses padding or a longer report than the first one.
- **Do not reload this skill with the skill tool on every turn.** The body is already in the conversation. Reload it once only if the conversation was compacted and these instructions are no longer visible.
- **Exit.** 关闭润色模式, 停止润色, 回到普通模式, 正常模式, "stop polishing", "normal mode" end it. Handle the current instruction normally, say `润色模式已关闭。` in one line, and stay out of the mode afterwards. A topic change is not an exit.
- **Scope.** One conversation only. A new conversation starts in normal mode; never carry the mode over because an earlier conversation used it.

## References

| Read | When |
|---|---|
| [diagnosis](references/diagnosis.md) | Classifying the destination, rating gaps, writing success criteria, choosing the default bundle |
| [clarity and structure](references/clarity-and-structure.md) | Ambiguous verbs, missing goal or audience, shouted or negative rules, sectioning and ordering |
| [examples](references/examples.md) | A pattern must be matched; deciding whether examples help or harm |
| [system prompts](references/system-prompts.md) | System prompts, app prompts, and agent operating instructions |
| [reasoning](references/reasoning.md) | Multistep analysis, self-checks, and when reasoning instructions backfire |
| [output control](references/output-control.md) | Format, length, structured data, prefill migration, formatting complaints |
| [context packaging](references/context-packaging.md) | What to include, point to, or leave out; ordering; caching; long tasks |
| [reliability and grounding](references/reliability-and-grounding.md) | Factual accuracy, quotes, citations, assumptions instead of invention |
| [trust boundaries](references/trust-boundaries.md) | Third-party content, tools with side effects, public users, personal data |
| [agent tasks](references/agent-tasks.md) | Prompts a coding, research, or operational agent executes |
| [decomposition](references/decomposition.md) | Splitting one prompt into a chain, a pipeline, or a system prompt plus a task |
| [model family notes](references/model-family-notes.md) | The user named the target model or family |
| [worked examples](references/worked-examples.md) | Calibrating length, placeholders, and the report |
| [sources](references/sources.md) | Where the catalog comes from and its limits |
| [improvement report](templates/improvement-report.md) | The output skeleton |
| [prompt skeleton](templates/prompt-skeleton.md) | Section order for task prompts and system prompts |

## Local notes（本机安装说明）

- 本技能是 `theultimate-dev/skills` 仓库中 `skills/prompt-engineering/improving-prompts` 的本地副本（上游许可：MIT）。上游地址见 frontmatter 的 `metadata.upstream`。
- 安装位置：`.dsh/skills/improving-prompts/`（随「项目主管」套件安装；模板在 `setup/skill-improving-prompts/SKILL.md`）。要全局生效，把整个目录复制到 `~/.dsh/skills/`。
- 与主管开关联动：主管开工前读工作区 `.dsh/supervisor.config.json` 的 `promptPolish`（默认 `true`；DSH「主管」面板的「提示词润色」滑块写它）。为 `false` 时主管不主动润色，但用户明确要求润色时仍按本技能执行。
- 主管默认把本技能当常驻能力（不需要「润色并执行」触发词）；用户说「这次别润色 / 关闭润色」可单次或本对话跳过，面板开关才是持久设置。
- 语言规则：报告用用户提问的语言写（中文提问就用中文报告）；被优化的提示词保持它原本的语言和语域，不翻译。
- 协作方式（默认）：先给「报告 + 可直接复制的增强提示词」，然后在同一轮里**按增强提示词立即行动**——任务类提示词就开工执行，系统提示词/Agent 常驻指令就采纳为本会话的作业规则。不需要再问用户「要不要执行」。
- 不行动的情形（短一句说明原因，不要闷声跳过）：① 增强提示词是给别的系统/别的模型用的（例如给 Midjourney、给外部 API、给未来某个 Agent）；② 主体本身就是提示词/人格卡/模板这类文本资产，而非本会话可执行的任务；③ 首步就缺只有用户能给的事实。这三种情况输出后停住，并说明理由。
- 行动时以 `<enhanced_prompt>` 里的文字为准，报告只是解释；行动产出的内容里不要夹带「技术点」「改进说明」这类元话术。
- 若用户给的是中文口语化需求且没有现成提示词，先按目标场景补全缺失信息，再输出增强提示词；无法推断的事实一律留成 `{{占位符}}`，不要编造。
- 加载即生效：本技能正文已在上下文中，行动阶段直接执行，不要为了「行动」再调用一次 skill 工具，也不要把增强提示词写进文件后才执行（除非用户明确要求存档）。
- 粘性模式（同一对话内持续生效）：用户在对话里说过「把这段需求润色成专业提示词并执行 / 润色并执行 / 开启润色模式」后，本对话即进入润色模式；此后每条指令都先工程化提示词再执行，直到用户说「关闭润色模式 / 停止润色 / 回到普通模式」。激活时回一句「润色模式已开启……」，退出时回一句「润色模式已关闭。」，不要重复宣告。完整规则见正文「## Sticky session mode」。
- 粘性模式下报告压成一行「## 润色要点」（目标场景 + 采用的技巧 + 至多一条未采用技巧及原因），增强提示词照旧放进 `<enhanced_prompt>` 代码块，然后立即执行；只有首次激活或用户主动索要时才给完整报告。
- 工作区根目录的 AGENTS.md 里有一条同样的常驻约定，用于上下文被压缩、技能正文不可见时的兜底；两者冲突时以本技能正文为准。


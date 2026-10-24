# Diagnosis

Turning a draft into a destination label, a severity-rated list of gaps, and success criteria the model can check.

## Contents

- Destinations
- Gap checklist
- Severity
- Success criteria
- Default bundles
- Ambiguous destination

## Destinations

| Destination | Signals | Consequences for the rewrite |
|---|---|---|
| Chat request | One imperative sentence or a question; a person reads the answer; no tools implied; often no context at all | Task sentence with audience and goal, the facts the reader lacks, output form; three to eight lines |
| System prompt or app prompt | "You are…"; behaviour that holds across users and sessions; tools, policies, or a persona described; often second person | Role, heuristic altitude, sections, tone and length rule, refusal and escalation, trust boundary, a static reusable prefix |
| Coding or research agent task | A repository, files, tests, logs, a codebase question; verbs like fix, implement, migrate, investigate, refactor; a harness with tools | Scope, pointers to files and patterns, a verification target, evidence in the handback, autonomy rules when unattended |
| Agent operating instructions | Rules meant for every session: commands, conventions, etiquette, environment quirks; files such as AGENTS.md or CLAUDE.md | Only what the agent cannot infer, short, one emphasized line at most, no tutorials |
| Long-document task | Pasted or attached documents, "based on the attached", inputs in the tens of thousands of tokens, several sources | Inputs first with metadata, question last, quote-first grounding, cite and retract, restrict to the material |
| Extraction or classification | A schema, a label set, "return JSON", a batch of similar inputs, downstream code reading the output | Schema shape with required and optional fields, `null` for missing values, enum labels, no preamble, diverse examples |

## Gap checklist

| Question | Evidence in the draft | Default severity |
|---|---|---|
| Is the goal stated, and would the model know when it is done? | No deliverable named; "help with", "look at", "improve" without a target state | blocks for deliverables, degrades for questions |
| Who reads or consumes the output, and where does the prompt run? | No audience; no hint of chat versus agent versus pipeline | degrades |
| Does the reader have the facts it needs? | "Our", "the", "this" without the thing itself; a product, code, or data assumed | blocks when the task cannot start without them, otherwise degrades |
| Are constraints and scope explicit? | Nothing about length, exclusions, what not to change, limits | degrades |
| Is the output form specified? | No format, length, or structure; machine-read output without a schema | degrades; blocks for machine-read output |
| Must the output match a pattern? | A house style, a label set, a tone, or a template implied but not shown | degrades |
| Does the task need reasoning, and does the destination reason on its own? | Multistep analysis with no guidance, or "think step by step" added to a lookup | degrades |
| What is at risk? | Third-party content read by the model; tools that write, send, or delete; high-stakes facts; personal data | blocks for untrusted content and irreversible actions; degrades otherwise |
| Does the draft fight itself? | Contradictions, duplicated rules, capitals, "must" chains, prohibitions without an alternative, instructions the destination cannot honour, paragraphs the model does not need | degrades; cosmetic when it is a single word |
| Does it rely on runtime assumptions? | A prefilled response, a sampling parameter, a tool or search the destination lacks | blocks when the destination rejects it, otherwise degrades |

## Severity

- `blocks`: the model cannot do the job as written. "Fix the login bug" with no symptom; a support assistant that reads customer emails with no trust boundary.
- `degrades`: the model will do the job worse. A report with no length or audience; a coding task with no verification target in an interactive session.
- `cosmetic`: the result is the same either way. A stray capitalized word; an extra blank line; a tag name that could be shorter.

Only `blocks` and `degrades` justify a change. A draft whose gaps are all cosmetic is already good: the report says so, the applied table holds the cosmetic fixes, and the enhanced prompt is not inflated to justify the exercise.

## Success criteria

Good criteria are specific, measurable, achievable, and relevant. "Classify sentiment well" is none of these; "with the labelled examples supplied, every positive review is labelled positive and no neutral review is labelled positive" is all four. Dimensions worth a criterion: task fidelity, consistency across similar inputs, relevance and coherence, tone and style, privacy, use of the supplied context, latency, and cost.

Write acceptance examples into the prompt when the output can be checked: "with inputs X the output is Y". For agents, name the check the agent can run. For factual work, name what counts as a source.

Every technique is a hypothesis about a particular prompt on particular inputs. Recommend an evaluation on representative inputs under Outside the prompt. Never claim a measured improvement in the report.

## Default bundles

Start from the bundle for the destination, then add or remove according to the gaps found.

| Destination | Start with | Usually rejected |
|---|---|---|
| Chat request | Verb and goal, audience, form and length, permission to say it lacks information when the task is factual, labelled assumptions | Tags, a role line, reasoning instructions, examples |
| System prompt or app prompt | Role, heuristic altitude, sections, tone and length, formatting rule, refusal and escalation, untrusted-content policy, provenance, static prefix, real examples when supplied | Manual chain-of-thought tags, long values lists, anti-formatting blocks |
| Coding or research agent task | Verification target, scope, bug shape or pattern pointers, default posture, keep changes to the task, handback with evidence; autonomy and scope blocks when unattended; research structure for research | Examples, a role line, reasoning instructions, pipelines |
| Agent operating instructions | Only the non-inferable, calm emphasis, defect removal, light sectioning | Tutorials, file-by-file descriptions, facts that change often, more than one emphasized line |
| Long-document task | Inputs first and question last, document wrappers with metadata, quote-first, cite and retract, restrict to the material, permission to say it lacks information, quotation marking | Manual chain-of-thought tags, examples unless labels matter |
| Extraction or classification | Schema shape with required, optional, and `null`, enum labels, no preamble, three to five diverse examples, one term per concept, labelled assumptions | A role line, reasoning instructions, prose-format instructions |

## Ambiguous destination

Choose the most likely destination from the signals and say which one under Diagnosis. When two readings would produce materially different prompts, deliver the most likely one, name the other under Assumptions, and keep the prompt usable in both where that costs nothing. A draft that mixes standing behaviour with a one-off task is two prompts; the decomposition reference covers the split.

A vague prompt is sometimes intentional. "What would you improve in this file?" is exploration; tightening it removes what the user wanted. Say so and leave it open.

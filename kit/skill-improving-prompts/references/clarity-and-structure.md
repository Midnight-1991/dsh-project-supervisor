# Clarity and structure

Techniques for saying what you want and for arranging the prompt so the model can parse it. Each entry: when it helps, when to leave it out, and a sample where one exists.

## Contents

- Say what you want
- Explain the constraint
- Positive framing and calm emphasis
- Remove defects
- Sectioning
- Ordering
- Match style to the output
- Response skeletons

## Say what you want

**The verb matches the action.** Current models follow instructions literally. "Can you suggest changes to this function?" gets suggestions; "Change this function to improve its performance" gets changes. Rewrite the verb to the action the user wants. Leave a deliberately open prompt open.

**Goal and definition of done in the first sentence.** State the deliverable, the audience, and what a finished result looks like. Apply to every deliverable. Skip for conversational questions.

**Sequential steps only when order matters.** Numbered steps help when the order or completeness of steps is essential, as in a migration or a checklist. For analysis and design, a general instruction plus the criteria beats a hand-written plan: reasoning-capable models plan better than the prescribed steps.

**Ambition or restraint modifiers only when the user signalled them.** "Include as many relevant features as possible; go beyond the basics" raises scope. "Only what is asked, nothing more" narrows it. Either one added without a signal from the user produces over-engineering or under-delivery.

**The colleague test.** Show the prompt to a colleague with minimal context on the task and ask them to follow it. If they would be confused, the model will be too.

## Explain the constraint

One clause of motivation lets the model generalize instead of rule-matching:

```text
Never use ellipses.
```

```text
Your response will be read aloud by a text-to-speech engine, so never use ellipses; the engine cannot pronounce them.
```

Apply when a constraint looks arbitrary or absolute. Never invent a motivation; when the user gave none and none is obvious, leave the constraint bare and list it under Assumptions.

## Positive framing and calm emphasis

Tell the model what to do rather than what not to do:

```text
Do not use markdown in your response.
```

```text
Write your response as flowing prose paragraphs.
```

Keep a prohibition only when it protects something (data, a system, a person), and pair it with the alternative: "Do not delete branches; list the ones that look stale instead."

Remove capitals, "CRITICAL", and chains of "must". Current models over-trigger on shouted rules: "CRITICAL: You MUST use this tool when…" becomes "Use this tool when…". Keep at most one emphasized line, for an instruction the model has demonstrably kept skipping. When every line is emphasized, none is.

## Remove defects

- **Contradictions.** List both readings, keep the one the draft's wording and context support, and flag the choice under Assumptions.
- **Duplicates.** One statement per rule. Repetition in a system prompt does not add weight; it adds tokens and ambiguity.
- **Mixed terminology.** One word per concept: always "ticket", never "ticket", "issue", and "case" for the same thing. Tag names follow the same rule.
- **Instructions the destination cannot honour.** Tests for a model without tools, "search the web" without search, "check the memory file" without one. Remove them or turn them into a placeholder the user can resolve.
- **Bloat.** A paragraph the model does not need costs attention. Cut explanations of things the model already knows.

## Sectioning

Use XML tags or markdown headings when the prompt mixes kinds of content: instructions, context, inputs, examples. Wrap each kind in its own container so the model does not mistake data for instructions or an example for the task.

- Descriptive, consistent tag names: `<instructions>`, `<context>`, `<documents>`, `<examples>`, `<input>`.
- Nest only for real hierarchy:

```text
<documents>
  <document index="1">
    <source>quarterly_report.pdf</source>
    <document_content>…</document_content>
  </document>
</documents>
```

- Headings and whitespace serve medium-length prompts as well as tags do; choose whichever the destination's other prompts already use.
- Short prompts get neither. A three-line request with a tag around each line is worse than the three lines.

## Ordering

- **Long inputs first, question last.** Put documents and data at the top and the instructions and question after them. On multi-document inputs this alone has raised response quality by up to about thirty percent in the provider's tests.
- **Static before variable.** Role, rules, tool guidance, and stable examples first; per-request facts, the date, and the incoming message last. This is also what lets a prompt cache hit.
- **Role and rules before task detail.** The model reads the frame before the specifics.

## Match style to the output

The prompt's formatting shapes the answer's formatting. A prompt written in bullet points invites bullet points; a prompt written in prose invites prose. When the complaint is "too much markdown", remove markdown from the prompt before adding rules about it.

## Response skeletons

For reports and structured documents, give the skeleton of the answer: the headings, which are mandatory, and what goes in each. A skeleton is cheaper than examples when only structure matters. Skip for conversational and creative output, where a skeleton flattens the result.

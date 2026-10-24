<!-- Fill every section in this order. Omit "Assumptions and placeholders" and "Outside the prompt" when they would be empty; keep every other section. Nothing follows the closing fence. -->

## Diagnosis

Destination: [chat request | system prompt or app prompt | coding or research agent task | agent operating instructions | long-document task | extraction or classification]. Target: [model or family as the user named it | not specified; neutral].

- [gap] (blocks | degrades | cosmetic)
- [gap] (blocks | degrades | cosmetic)
- [gap] (blocks | degrades | cosmetic)

## Techniques applied

| Technique | Why here |
|---|---|
| [technique] | Closes "[gap]": [one sentence specific to this prompt] |

## Techniques considered and not applied

| Technique | Why not |
|---|---|
| [technique] | [reason specific to this prompt: the gap it would close is absent, the fact it needs is missing, the cost it adds, or the applied technique it would conflict with] |

## Assumptions and placeholders

- `[placeholder as it appears in the prompt]`: [what to fill in]; [why it could not be inferred]
- Assumed: [interpretation chosen and why]

## Outside the prompt

- [runtime setting, architecture note, or evaluation suggestion the prompt text cannot carry]

<!-- Open the fence with more backticks than any run inside the prompt, at least four. For a system prompt and a task prompt together, deliver two fences: <enhanced_prompt role="system"> then <enhanced_prompt role="user">. -->

````text
<enhanced_prompt>
[the prompt, nothing else: no title, no technique labels, no notes to the user]
</enhanced_prompt>
````

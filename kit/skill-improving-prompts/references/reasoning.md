# Reasoning

When to ask the model to reason, how, and when the request backfires.

## Prefer a general instruction

"Think it through carefully before answering" beats a prescribed step list on reasoning-capable models. Their reasoning frequently exceeds what a human would write down. Reserve step lists for order-critical procedures.

Apply to multistep analysis, design trade-offs, debugging, and mathematics. Skip for lookups, formatting, translation, and extraction with a schema.

## When the destination already thinks

Many current models reason internally by default, and the depth is a runtime setting (an effort or reasoning level), not prompt text. Adding "think step by step" to such a model adds nothing and can add latency. Put the depth choice under Outside the prompt. The exception is a case the provider has measured, such as a line asking a model that often skips thinking before JSON answers to multistep problems to think first, with adaptive thinking on (see the model family notes).

If thinking fires too often, typically under a large system prompt, a trigger rule helps:

```text
Thinking adds latency and is worth it only when it will improve the answer, typically for problems that need multistep reasoning. When in doubt, respond directly.
```

Where the provider says lowering effort reduces thinking more reliably than prompt text, lower the effort under Outside the prompt before adding a trigger rule. Where it reports that removing "think carefully" lines from a chat system prompt made replies start sooner without a clear loss of quality, propose removing them rather than adding the general instruction above (see the model family notes).

## Manual chain of thought

When internal thinking is unavailable and the reasoning must be separable from the answer, ask for both in tags:

```text
Reason through the problem in <thinking> tags, then give the final answer in <answer> tags.
```

Reject for latency-bound chat, for models known to leak internal tags into visible output, and for models that can decline a request to write their reasoning into the response; read their summarized thinking instead (see the model family notes). Where thinking can be enabled at a low depth, that beats manual tags.

## Self-check

```text
Before you finish, verify your answer against [the criteria].
```

Strongest for code and mathematics with checkable criteria. Reject on models that already verify their own work: the instruction compounds into over-verification, adding tokens and latency without improving the result. Where the provider says this depends on effort, apply the check at the levels where checks get skipped and curb extra review rounds at the highest (see the model family notes).

## Commit to an approach

For loops that re-deliberate:

```text
Choose an approach and commit to it. Revisit the decision only when new information contradicts your reasoning; you can course-correct later if the approach fails.
```

## Reasoning in examples

Put the reasoning inside few-shot examples, in `<thinking>` blocks or a sentence before the answer, when the label depends on judgment. The model generalizes the pattern.

## Research reasoning

For complex research, structure the work:

```text
Develop competing hypotheses as you gather evidence, track your confidence in each, and revise the list as you go. Note what would change your conclusion.
```

## Reject when

- The task is a lookup, a transformation, or schema extraction.
- The destination reasons natively and nothing in the draft suppresses it.
- The user's complaint is latency or cost.

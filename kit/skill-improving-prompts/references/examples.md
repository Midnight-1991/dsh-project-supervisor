# Examples

When to show the model what a good output looks like, how to shape the set, and when examples do harm.

## When examples pay

Examples steer format, tone, label choice, and edge handling more reliably than descriptions. Apply when the output must match a pattern: a house style, a label set, a response template, a voice. Skip when a sentence describes the task fully; "return the dates as YYYY-MM-DD" needs no example.

## Shape

- Three to five examples. Fewer teaches an accident; more rarely helps.
- Relevant: mirror the real inputs, not simplified ones.
- Diverse: cover the variation the model will meet, so it does not learn an unintended pattern such as "answers are always short" or "the first label is always right".
- Canonical: representative cases, not a laundry list of edge cases. Edge cases belong in one or two lines of rules.
- Wrapped: each in `<example>`, the set in `<examples>`, so the model distinguishes them from instructions.
- Consistent: the same formatting in every example. Inconsistent examples teach inconsistency on every model family.

```text
<examples>
<example>
<input>…</input>
<output>…</output>
</example>
</examples>
```

## Start with one

Add one example first and escalate to three to five only when the output still misses. When only structure matters, a response skeleton is cheaper than an example and does not invite copying.

## Examples that show reasoning

When the right label or answer depends on judgment, include the reasoning in the example, in a `<thinking>` block or a sentence before the answer. The model generalizes the pattern of reasoning, not only the answer.

For subtle behaviours, one complete example works better than a rule: the request, the response, and a `<rationale>` line saying why the response is correct. This is the fix for "summarizes the source in its own words but reproduces passages without marking them" and for tone that rules cannot pin down.

## Never invent examples

An invented example teaches an invented voice, invented labels, or invented facts. When the user supplied none, insert a placeholder and say so under Assumptions:

```text
<examples>
[paste two or three real examples of the answers you want, each with its input]
</examples>
```

Under Outside the prompt, suggest asking the model to check the supplied examples for relevance and diversity, or to generate candidates from real seeds for the user to approve.

## Reject when

- Creative work where copying the example is the risk.
- Simple transformations a sentence describes.
- The draft is already long and a skeleton carries the pattern.
- The examples would have to be invented.

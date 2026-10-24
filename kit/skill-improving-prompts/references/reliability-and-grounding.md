# Reliability and grounding

Keeping the answer tied to what is known.

## Contents

- Permission to be uncertain
- Ground in the material
- Assumptions instead of invention
- Verify across sources
- Code questions
- Outside the prompt
- Reject when

## Permission to be uncertain

```text
If the material does not contain what you need, say "I do not have enough information to answer this" rather than guessing.
```

The single cheapest reduction in invented answers. Apply to factual, analytical, and advisory work. Skip for fiction.

## Ground in the material

- **Quote first.** For long documents, ask for the relevant passages in `<quotes>` tags before the task; the answer then builds on them.
- **Cite and retract.** For drafting from sources: "After drafting, find a supporting passage for each claim. Remove any claim you cannot support and mark the gap with []."
- **Restrict to the material.** When the intent is a closed corpus: "Use only the documents provided, not general knowledge." Skip when the user wants the model's general knowledge.

## Assumptions instead of invention

When the draft leaves a fact open, instruct the model to label its interpretation rather than fill the gap silently:

```text
Where the request is ambiguous, state the interpretation you chose. Where a fact is missing, write [needs: what is missing] instead of inventing one.
```

For high-stakes domains, add a final scan: "Before finishing, check for unstated assumptions and claims stated more strongly than the evidence supports."

## Verify across sources

For research: define what counts as a successful answer, ask for verification across sources, and ask for contradictions to be resolved explicitly, with citations for web-derived claims.

When the model may answer from memory about a name it half-knows, especially in fast-moving areas:

```text
When a query centres on a name you do not confidently recognize, or one from an area that changes within months, search before answering, and include the name as written.
```

## Code questions

```text
Read the relevant files before answering. Do not speculate about code you have not opened.
```

Ask for evidence rather than assertion: the command run, its output, the diff.

## Outside the prompt

Best-of-N comparison, iterative refinement passes, and evaluations on representative inputs are recommendations for the workflow, not prompt text. List them under Outside the prompt.

## Reject when

- Pure transformation (formatting, translation) of supplied text.
- Fiction.
- The user wants the model's general knowledge and no material exists; keep only the permission to be uncertain.

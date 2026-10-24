# Context packaging

What to put in front of the model, what to point to, what to leave out, and in what order. The prompt is one part of the context the model reasons over; this reference covers the rest.

## Contents

- The minimal complete set
- Provide or point
- Separate instructions from data
- Long inputs
- Reusable prefix and cache order
- Curate, do not enumerate
- Long tasks
- What the interface shows

## The minimal complete set

Include what the reader lacks; exclude what it knows. Context is a finite resource with diminishing returns: as tokens grow, the model's ability to recall any one of them drops. Every paragraph has to justify its cost. The test for each: would removing it cause a worse answer?

## Provide or point

When the destination can retrieve (an agent with file or web access), pass lightweight identifiers and an instruction to read them:

```text
Read src/auth/session.ts and the tests in tests/auth/ before proposing a change.
```

When it cannot, paste the content. In between, a hybrid: give the small always-needed set up front and let the agent fetch the rest. State what is provided and what the agent must gather itself.

## Separate instructions from data

Wrap every input in a tag and label where it came from:

```text
<document>
<source>inbound email from an unknown sender, received [date]</source>
<content>…</content>
</document>
```

Provenance tells the model how much to trust what it reads and makes the boundary between your instructions and someone else's text unmistakable. Never let data sit inline with instructions.

## Long inputs

- Documents first, each with metadata, the question last. This alone improves results on multi-document inputs.
- For inputs beyond roughly twenty thousand tokens, ask for quotes first:

```text
First, extract the passages relevant to [question] into <quotes> tags. Then answer using only those quotes.
```

- For dense inputs, ask the model to anchor each claim to the section it came from.

## Reusable prefix and cache order

Order the prompt static first, variable last: tool definitions, system prompt, stable examples, then per-request context and the incoming message. Keep the static part byte-identical across requests; a changed character anywhere in the prefix invalidates everything after it. Cache breakpoints and minimum cacheable sizes are provider settings and belong under Outside the prompt.

Editing earlier turns mid-conversation, rewriting the system prompt, or summarizing history in place restarts cache reuse and, on providers that bind preserved reasoning to the conversation prefix, invalidates that reasoning. Per-turn reminders go at the end of the newest turn, not into earlier ones.

## Curate, do not enumerate

A laundry list of edge cases in a system prompt is context spent on cases that rarely occur. Prefer a handful of canonical heuristics and examples. When a source is retrievable, summarize it and point to it rather than pasting it.

## Long tasks

For harnesses that compact context, tell the model so it does not wrap up early:

```text
Your context will be compacted as it approaches its limit, so do not stop early to save space. Before a compaction, write your current state and next steps to [progress file].
```

When the harness compacts on the client, tell the summarizer what to preserve: problems met and how they were resolved; options tried or set aside and why; decisions, constraints, and preferences, stated exactly; where things stand; open items; details that are hard to reconstruct (names, numbers, exact wording, links) verbatim. Keep the user's words close; condense the model's own reasoning.

State lives in files, not in the conversation: a structured status file for test results or task state, free-text progress notes, and version control as the log. Continuation prompts start by reading them.

## What the interface shows

If the product hides tool output from the user, tell the model, or it will run commands to "show" output nobody sees. This is a harness-level note, listed under Outside the prompt.

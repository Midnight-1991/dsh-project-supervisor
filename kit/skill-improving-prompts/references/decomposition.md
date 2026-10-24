# Decomposition

When one prompt should become several, and when it should not.

## Start simple

One well-packaged call with the right context and examples solves most tasks. Add a pipeline only when it demonstrably improves the outcome, because every extra step adds latency, cost, and a seam where context is lost.

## Split durable behaviour from a one-off task

A draft that mixes standing behaviour ("you are the support assistant…") with a specific task ("now answer this ticket") is two prompts: a system prompt and a task prompt. Deliver both, each engineered for its destination.

## Chaining

Sequential calls, each consuming the previous output, when intermediate outputs must be inspected, logged, or branched on, or when a pipeline order must be enforced. The most useful chain is self-correction: draft, then review against named criteria, then refine. Each step gets its own prompt with its own output tags.

## Routing

Classify the input first, then dispatch it to a specialized prompt. A cheap classifier in front of capable specialists lets each prompt stay focused.

## Parallelization

Sectioning: independent parts run at the same time and are merged. Voting: several runs with diverse prompts on a judgment call, then a decision rule. Reject when the steps depend on each other.

## Orchestrator and workers

When subtasks cannot be predicted in advance, an orchestrator decomposes the work and dispatches bounded packets to workers, each with a clear output contract. Workers return a distilled summary, not their whole context, and the orchestrator owns integration.

## Evaluator and optimizer

One prompt generates, another evaluates against criteria, and the loop repeats. Worth it only when the criteria are clear and refinement measurably improves the result.

## Continuation

When a task outlives one context window: a setup prompt for the first window, continuation prompts that start from state on disk, and a summarization instruction that says what a compaction summary must preserve. Where the provider binds preserved reasoning to the conversation, keep the history append-only and change instructions through the mechanisms the provider offers rather than by editing earlier turns.

## Reject when

- A capable model handles the multistep reasoning in one pass and nobody needs the intermediates.
- The added latency, cost, or coordination is not justified by a measured gain.
- The prompt is a chat request.

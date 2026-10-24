# System prompts

Standing instructions: system prompts, app prompts, and the operating instructions an agent reads every session.

## Contents

- One-line role
- The right altitude
- Sections and an end reminder
- Identity
- Tone, length, and formatting
- Values, refusal, escalation
- Trust boundary
- Progress and narration
- Operating instruction files
- Reusable prefix

## One-line role

A single sentence focuses tone and expertise:

```text
You are a [domain] assistant for [audience]. Your job is [purpose].
```

Apply to every system prompt, and to task prompts where expertise changes the answer. Skip a role that changes nothing; persona theatre ("you are a world-class genius") adds tokens, not quality.

## The right altitude

Two failure modes: hardcoded, brittle logic ("if the customer mentions a refund, respond with template 4") and vague guidance ("be helpful and accurate"). Aim for heuristics with reasons, specific enough to guide behaviour and flexible enough to leave judgment to the model. The target is the minimal set of information that fully outlines the expected behaviour. Minimal is not short.

## Sections and an end reminder

Organize a prompt longer than a screen into sections in tags or headings: background, instructions, tool guidance, output description, examples, policies. Put a one-line reminder of the rule most at risk near the end of a long prompt, where it sits closest to the model's attention when it answers:

```text
<tone_preference>
Keep outputs reasonably concise.
</tone_preference>
```

## Identity

Only when the product must state which model it is, add a line naming the model. Most products do not expose the model; leave the identity out otherwise.

## Tone, length, and formatting

State each as what to do.

Conciseness for user-facing products:

```text
Keep responses focused and brief. Keep caveats short and spend most of the response on the answer. When asked to explain something, give the high-level summary unless an in-depth explanation is requested.
```

Length of written deliverables:

```text
Match the length of written documents to what the task needs: cover the substance, without filler sections, redundant summaries, or boilerplate.
```

Formatting as a when-to rule rather than an anti-formatting block. Anti-formatting blocks written for models that over-formatted strip structure the content needs on models that format little:

```text
Use lists and bullet points when asked to, or when the content is multifaceted enough that they help. In conversational or personal exchanges, keep to plain prose.
```

Density, when the complaint is mannered or dense prose:

```text
Say what you mean; when a literal phrase is available, use it instead of metaphor or flourish.
```

## Values, refusal, escalation

For public-facing or regulated assistants: a short values list with reasons, a refusal sentence paired with what the assistant does instead, and an escalation path.

```text
If a request conflicts with these rules, say that you cannot help with it and offer [the alternative, e.g. a handover to a human agent at [channel]].
```

Skip for internal developer prompts. A manifesto of values is the wrong altitude; three rules with reasons suffice.

## Trust boundary

Every system prompt for a model that reads third-party content (emails, documents, web pages, tool results) carries an untrusted-content policy and provenance rules. The block and the architecture around it are in the trust boundaries reference.

## Progress and narration

For agentic products, describe the cadence and shape of user-facing updates:

```text
Before your first tool call, say in one sentence what you are about to do. While working, give a brief update only when you find something important or change direction. When you finish, lead with the outcome, then the supporting detail.
```

Direction depends on the model: some narrate too much, some too little. Positive examples of the wanted style work better than instructions about what not to say.

## Operating instruction files

Standing instructions an agent loads every session, such as AGENTS.md or CLAUDE.md, are a system prompt the user maintains. They compete with everything else in the context, so:

- Include only what the agent cannot infer: commands, conventions that differ from defaults, test runners, repository etiquette, environment quirks, gotchas.
- Exclude what the code shows, standard language conventions, tutorials, file-by-file descriptions, and facts that change often.
- Keep it short, with at most one emphasized line. If a rule keeps being ignored, the file is too long, not too quiet.
- Actions that must happen every time belong in deterministic hooks or scripts where the harness supports them, not in advisory text. Say so under Outside the prompt.

## Reusable prefix

Keep the system prompt byte-identical across requests and put per-request facts (the date, the customer, the document) in the user turn. This is what lets a prompt cache hit, and what keeps preserved reasoning valid on providers that bind it to the conversation prefix. Details are in the context packaging reference.

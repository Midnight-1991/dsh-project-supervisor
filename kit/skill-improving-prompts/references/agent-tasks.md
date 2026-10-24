# Agent tasks

Prompts that a coding, research, or operational agent executes with tools. The agent does what the prompt says and stops when the work looks done, so the prompt has to say what done looks like and how to check it.

## Contents

- Verification target
- Scope the task
- Explore, plan, implement
- Action verbs and default posture
- Unattended runs
- Keep changes to the task
- Tools, parallelism, delegation
- Progress and handback
- Research tasks
- Long-horizon work
- Large features
- Independent review
- Tool descriptions
- Reject when

## Verification target

Give the agent a check it can run and read: a test suite, a build, a linter, a script that diffs output against a fixture, a screenshot compared with a design. Without one, "looks done" is the only signal and the user becomes the verification loop.

| Draft | Engineered |
|---|---|
| implement a function that validates email addresses | write a validateEmail function; `user@example.com` is valid, `invalid` and `user@.com` are not; add these as tests and run them |
| the build is failing | the build fails with this error: [paste it]; fix the root cause rather than suppressing the error, and verify the build passes |
| make the dashboard look better | implement the attached design; take a screenshot of the result, compare it with the design, list the differences, and fix them |

Ask for evidence in the handback: the command, its output, the screenshot. Reviewing evidence is faster than re-running the check.

## Scope the task

- **File, scenario, preferences.** "Write a test for foo.py covering the logged-out edge case; avoid mocks", not "add tests for foo.py".
- **Bugs: symptom, likely location, what fixed looks like.** "Users report that login fails after the session times out. Check the auth flow, especially token refresh. Write a failing test that reproduces it, then fix it."
- **Point to sources and patterns.** "Look at how existing widgets are implemented; the hot-dog widget is a good example; follow that pattern." "Read the git history of this module and summarize how its API came to be."
- **Keep a vague prompt only for deliberate exploration.** "What would you improve in this file?" is a legitimate prompt when the user can afford to course-correct.

## Explore, plan, implement

When the change spans files or the approach is uncertain, ask for a short investigation and a written plan before edits. When the diff fits in one sentence (a typo, a log line, a rename), ask for the change directly; planning is overhead there.

## Action verbs and default posture

"Change this function" gets changes; "can you suggest changes" gets suggestions. Match the verb to the intent. Where the user described how they like to work, set the default posture:

```text
By default, implement changes rather than only suggesting them. When intent is unclear, infer the most useful action and use tools to discover missing details instead of guessing.
```

```text
Do not change files unless clearly instructed to. When intent is ambiguous, research and recommend rather than act.
```

Leave the posture alone when the user said nothing about it.

## Unattended runs

When nobody is watching, the agent must not end its turn to ask about work already requested. Two additions, applied together; the first carries most of the effect:

```text
You are operating autonomously; the user is not watching and cannot answer questions mid-task. Proceed on reversible actions that follow from the request. Stop only for destructive actions or genuine scope changes the user must decide. If your last paragraph is a plan, a question, or a promise about work not yet done, do that work now. End your turn only when the task is complete or you are blocked on input only the user can give.
```

```text
The request sets the scope, and the scope is the deliverable: do not narrow, widen, or swap it. Make routine judgment calls yourself; check in only when different readings would lead to materially different work. If part of the task is blocked, finish every other part and say exactly what was left out and why.
```

Reject both for pair-programming sessions, where questions are wanted. Note under Assumptions that the autonomy block also reduces clarifying questions on ambiguous requests.

## Keep changes to the task

```text
If you find a pre-existing bug, a performance concern, or behaviour the task does not mention, do not fix or extend it in this change; report it as a follow-up. Where the task is ambiguous, implement the reading its wording most directly supports and state that assumption. Commit tests only where the task asks for them or the repository keeps tests for this kind of change, sized like the neighbouring tests. Implement every requested behaviour completely.
```

Related instructions, each for a specific complaint:

- **Over-engineering.** "Only what is asked or clearly necessary: no extra features, no refactoring of untouched code, no docstrings or comments on code you did not change, no error handling for cases that cannot happen, no abstractions for one-time operations."
- **Test gaming.** "Write a general solution that works for all valid inputs, not only the test cases. Tests verify correctness; they do not define the solution. If a test is wrong or the task infeasible, say so rather than working around it."
- **Whole-file rewrites.** "Make targeted edits rather than rewriting a file, unless most of it changes."
- **Scratch files.** "Remove any temporary scripts or helper files you created before finishing."

## Tools, parallelism, delegation

```text
When several tool calls do not depend on each other, make them in the same turn. Never guess or placeholder a tool parameter; when a value depends on an earlier result, wait for it.
```

```text
Use subagents only for sizeable, genuinely independent work such as a wide multi-file investigation. Do not delegate work you can finish in a handful of tool calls, and do not use subagents to verify your own work. One subagent rather than several when one suffices.
```

Caps on delegation depth, concurrency, and spend are harness settings; list them under Outside the prompt.

## Progress and handback

For long tool chains with a human watching, ask for a cadence: one sentence before starting, a brief update at important findings or changes of direction, and a closing recap that stands on its own. The final message leads with the outcome and attaches the evidence.

## Research tasks

Define what a successful answer contains, ask for verification across sources, and for complex research ask for competing hypotheses, confidence tracking, and a notes file that persists the state.

## Long-horizon work

Work that spans several context windows needs two prompts. The first sets up the framework: write the tests, create setup and run scripts, write a todo list. Continuation prompts start from state on disk:

```text
Review the progress notes, the test status file, and the recent log before touching code. Run the fundamental integration test first. Then continue with the next open item, and record progress before stopping.
```

Keep test status in a structured file, progress in free text, and use version control as the log. Encourage full use of the budget without leaving significant uncommitted work.

## Large features

Have the agent interview the user first and write a spec, then implement in a fresh session from the written spec. A useful spec names the files and interfaces involved, states what is out of scope, and ends with an end-to-end verification that proves the feature works.

## Independent review

Before treating work as done, ask for a review in a fresh context that sees only the diff and the criteria:

```text
Review the diff against [the plan or requirements]. Check that every requirement is implemented, the listed edge cases have tests, and nothing outside the task changed. Report gaps that affect correctness or the stated requirements, not style preferences.
```

A reviewer asked to find gaps usually reports some; scope it to correctness so the findings do not drive over-engineering.

## Tool descriptions

When the "prompt" is a tool description: one or two crisp sentences on what the tool does and when to use it, unambiguous parameter names and types, no overlap with sibling tools, an example for the edge cases, and parameters shaped so mistakes are hard, such as absolute paths rather than relative ones.

## Reject when

- The destination has no tools.
- The user is asking a question or thinking out loud rather than requesting a change; then the deliverable is an assessment, and the prompt should ask for one.

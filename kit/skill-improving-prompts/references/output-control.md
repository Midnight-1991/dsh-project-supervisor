# Output control

Getting the form, length, and structure you asked for.

## Contents

- State the form once
- Output tags
- Structured data
- No preamble
- Prefill migration
- Math and markup
- Markdown versus prose
- Quotations and terms
- Corrections

## State the form once

Format, length, structure, and audience in one place. Length as a unit or a range: "two paragraphs", "under 200 words", "one table with these columns". Apply to every deliverable. Skip when the user wants the model to choose the form.

## Output tags

When a consumer parses the answer, or the answer has parts, ask for each part in a tag:

```text
Write the summary in <summary> tags and the open questions in <questions> tags.
```

Skip for chat.

## Structured data

Describe the shape in the prompt; enforce the schema at runtime where the API offers structured outputs (Outside the prompt). Distinguish required from optional fields, and say what to do with missing values:

```text
Return only a JSON object with the fields [list]. Fields marked optional may be null; set a field to null when the input does not contain it, and never guess a value.
```

For classification, list the allowed labels and ask for exactly one:

```text
Classify each input as one of: [label], [label], [label]. Output only the label.
```

Ask for the JSON alone, with no prose before or after it.

## No preamble

```text
Respond directly, without introductory phrases such as "Here is" or "Based on".
```

Apply to terse or machine-consumed output. Skip for conversation.

## Prefill migration

A draft that relies on a prefilled assistant turn ("Here is the JSON: {") should stop relying on it; recent models reject a prefill on the last assistant turn. Replace it with:

- a direct no-preamble instruction, for skipping introductions;
- output tags or structured outputs, for format;
- a user-turn continuation, for resuming: "Your previous response ended with `[last text]`. Continue from there."

## Math and markup

When the surface renders no LaTeX or MathJax:

```text
Write mathematics in plain text: "/" for division, "*" for multiplication, "^" for exponents. Do not use LaTeX or markup notation.
```

## Markdown versus prose

When the complaint is too much markdown, first remove markdown from the prompt (the prompt's style shapes the answer's style), then state the wanted form positively:

```text
Write in flowing prose paragraphs. Reserve markdown for inline code, code blocks, and simple headings.
```

## Quotations and terms

When the model summarizes sources, ask it to mark reproduced wording as a quotation and to convey the rest in its own words. For non-expert readers, ask for terms to be defined on first use and for concrete examples inside the deliverable.

## Corrections

For user-facing products where the model narrates corrections to its earlier statements:

```text
Correct an earlier statement only when the error would change the reader's decisions. State the correction briefly and continue.
```

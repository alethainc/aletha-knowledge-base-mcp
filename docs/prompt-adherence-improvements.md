# Prompt Adherence Improvements

Recommendations for more consistent prompt adherence in the Aletha Knowledge Base MCP.

---

## 1. Remove the "not rigid instructions" framing in `kb-init`

**Problem**: Line 409 of `src/index.ts` says:
> "Internalize this as background knowledge — use it to inform your decisions, not as rigid instructions to follow literally."

This actively tells Claude to treat your guidelines loosely. If the Writing Guidelines say "never use the word 'revolutionary'" and Claude reads this framing, it has permission to ignore that rule.

**Fix**: Replace with directive framing:
> "These documents define the rules and constraints for your work. Brand guidelines, writing rules, and approved claims are mandatory — follow them exactly."

---

## 2. Pre-load critical documents instead of asking Claude to load them

**Problem**: Both `marketing-agent` and `website-guide` tell Claude to *call tools* to load docs. This introduces multiple failure points — Claude might skip docs, load them in the wrong order, or lose focus after processing 5-6 tool calls before it even starts the task.

**Fix**: Use the MCP prompt response to return multiple messages — include the actual document content in the prompt response itself. The MCP spec supports returning an array of messages. You could pre-fetch the 3-4 critical docs (brand positioning, writing guidelines, claims reference) and return them as assistant/user message pairs before the task instructions.

This is the single highest-impact change. When instructions and constraints are *already in context* rather than needing to be fetched, adherence goes up dramatically.

---

## 3. Label documents by their role when they enter context

**Problem**: When `read_doc` returns content, it comes back as a flat blob with a title header. Claude treats all loaded content the same — it doesn't distinguish between "you must follow this" (Writing Guidelines) and "use this for inspiration" (blog posts).

**Fix**: In `src/tools/read-doc.ts`, wrap returned content with role-based framing based on the document's category from the kb-map:

- Brand/Marketing docs: `"## [MANDATORY CONSTRAINTS] Aletha Writing Guidelines\nYou MUST follow every rule in this document.\n---\n{content}"`
- Clinical docs: `"## [REFERENCE — CITE ACCURATELY] White Paper\nUse exact claims from this document. Do not paraphrase medical claims.\n---\n{content}"`
- Blog content: `"## [REFERENCE ONLY — DO NOT COPY] Blog Post\nUse for tone and structure inspiration only.\n---\n{content}"`

This gives Claude a clear signal about *how* to use each document, right at the point of delivery.

---

## 4. Break the website-guide into focused stages

**Problem**: The `website-guide` prompt is 500+ lines delivered all at once. Research on LLM behavior consistently shows that when you front-load dozens of requirements, the model "forgets" or deprioritizes requirements in the middle. Your E-E-A-T rules, AEO rules, SEO rules, and template all compete for attention.

**Fix**: Split into a multi-stage workflow:
1. **Stage 1**: Load context + generate the content following the template structure
2. **Stage 2**: Self-review against E-E-A-T checklist (return pass/fail for each item)
3. **Stage 3**: Self-review against SEO/AEO checklist
4. **Stage 4**: Final output with compliance report

You could implement this as a single prompt that explicitly structures the work into phases with self-verification gates, or as separate prompts that chain together.

---

## 5. Add a self-verification step to every prompt

**Problem**: The marketing-agent's process ends at "assume human review will follow." The website-guide has a pre-publish checklist, but it's passive — nothing forces Claude to actually run through it.

**Fix**: Add an explicit verification instruction at the end of every prompt:

```
## Before Delivering Output

Review your output against the loaded guidelines. For each rule below,
confirm compliance or flag a deviation:

1. All product claims appear in the Quick Claims Reference ☐
2. Tone matches Writing Guidelines (no hype words, etc.) ☐
3. Product names are exact (Hip Hook Mark, not "Hip Hook Mark II") ☐
4. No fabricated clinical claims ☐
5. Medical disclaimer included ☐

Include this checklist in your response.
```

When Claude has to explicitly verify each point, it catches its own drift. This works especially well when the checklist references *specific documents it already loaded*.

---

## 6. Restructure the kb-map to distinguish mandatory vs. optional

**Problem**: The kb-map treats everything as equally important. "Load when creating marketing content" and "Reference for deep clinical claims" have the same weight. Claude is left to decide what matters.

**Fix**: Add explicit tiers:

```markdown
## For Marketing Tasks

### REQUIRED (always load these)
- Writing Guidelines (id: ...)
- Quick Claims Reference (id: ...)
- Brand Positioning (id: ...)

### LOAD IF RELEVANT
- Customer Personas — if targeting a specific segment
- Scroll-Stoppers — if writing ads or subject lines

### DO NOT USE
- Clinical white papers (unless user explicitly asks)
- Product manuals (unless writing product content)
```

This eliminates ambiguity about what Claude should and shouldn't load for each task type.

---

## 7. Add adherence reinforcement to tool descriptions

**Problem**: Tool descriptions are visible in every LLM turn. Your current tool descriptions are purely functional ("Retrieve document content"). This is wasted real estate.

**Fix**: Add brief adherence reminders to the tool descriptions in `src/index.ts`:

```typescript
{
  name: "read_doc",
  description: "Retrieve a document from the knowledge base. " +
    "Brand and Writing docs are CONSTRAINTS — follow them exactly. " +
    "Clinical docs are REFERENCE — cite accurately, never fabricate. " +
    "Blog content is INSPIRATION — do not copy verbatim.",
  ...
}
```

This way, every time Claude calls or considers calling `read_doc`, it gets a micro-reminder about how to use the content.

---

## 8. The marketing-agent explicitly disclaims its own purpose

**Problem**: Lines 458-465 say:
> "Does not define or enforce writing style. Does not enforce language rules."

This is telling Claude that even after loading the Writing Guidelines, it doesn't need to enforce them. This completely undermines the point of the prompt.

**Fix**: Replace with positive framing of what the agent *does* do:

```
## What This Agent Does
- Loads brand voice and writing style rules and follows them in all output
- Uses only approved claims from the knowledge base
- Matches tone and terminology to Aletha standards
- Delivers draft content for human review and iteration
```

---

## 9. Add a lightweight "compliance" tool

**Problem**: There's no way to programmatically check whether output follows guidelines. Everything depends on Claude self-policing.

**Fix**: Add a `check_compliance` tool that takes generated text and a document ID (e.g., the Writing Guidelines), and returns a structured comparison. Even if this tool is just a prompt-based check internally, having it as a discrete tool step makes Claude more likely to use it and makes violations visible.

---

## 10. Pin key rules in the prompt footer, not just the header

**Problem**: Due to how attention works in transformers, instructions at the very beginning and very end of context get the most attention. Your critical rules are buried in the middle of long prompts.

**Fix**: After the `## Current Task` section at the bottom of each prompt, add a brief recap of the 3-5 most-violated rules:

```
## Reminders
- Use ONLY claims from the Quick Claims Reference
- Product names: Hip Hook Mark, Range, Orbit, Band (exact names only)
- No superlatives ("best", "revolutionary", "groundbreaking") unless in approved claims
- Medical disclaimer required on all health content
```

---

## Priority Order

If implementing incrementally:

1. **Pre-load docs in prompts** (#2) — highest ROI, eliminates the biggest failure mode
2. **Remove undermining language** (#1, #8) — quick fix, immediate improvement
3. **Add self-verification steps** (#5) — moderate effort, high impact
4. **Label documents by role** (#3) — moderate effort, helps across all prompts
5. **Pin rules at prompt footer** (#10) — quick fix, good marginal improvement
6. **Restructure kb-map** (#6) — moderate effort, helps with document selection
7. **Break website-guide into stages** (#4) — higher effort, needed for that specific prompt
8. **Tool description reinforcement** (#7) — quick fix, subtle but persistent effect
9. **Compliance tool** (#9) — higher effort, good for auditability
10. **Everything else** — diminishing returns

# Creating Custom Skills for the Knowledge Base

Want Claude to have a specialized workflow for your team? You can request a custom "skill" - a pre-configured prompt that automatically loads the right documents and follows specific instructions.

## What is a Skill?

A skill is a shortcut that tells Claude:
- What documents to load from the knowledge base
- What role or expertise to assume
- What process to follow
- What to include or exclude

**Example:** The `marketing-agent` skill automatically loads brand guidelines, visual guidelines, and marketing references before helping with content creation.

## How to Request a New Skill

Fill out this template and send it to Michael:

---

### Skill Request Template

**Skill Name:** *(one or two words, lowercase with dashes, e.g., "hr-assistant", "sales-pitch")*

**Description:** *(one sentence explaining what this skill does)*

**Documents to Load:** *(list the knowledge base documents Claude should read before responding)*
- Document 1
- Document 2
- etc.

**Instructions for Claude:** *(what should Claude do with this skill? be specific)*

**What to Include:** *(what topics/documents are in scope)*

**What to Exclude:** *(what should Claude NOT do or reference)*

**Optional Inputs:** *(any parameters the user might provide)*
- Input 1: *(name and description)*
- Input 2: *(name and description)*

---

## Example Submission

Here's a filled-out example:

---

**Skill Name:** `support-response`

**Description:** Customer support response agent that uses our tone guidelines and FAQ docs.

**Documents to Load:**
- Customer support tone guide
- Product FAQ
- Common issues and resolutions

**Instructions for Claude:**
1. Load the support tone guide and FAQ documents
2. Match our friendly but professional support voice
3. Provide accurate answers based on our documentation
4. Suggest escalation to human support when appropriate

**What to Include:** Support tone guidelines, FAQ, known issues, product documentation

**What to Exclude:** Internal pricing, employee policies, technical implementation details

**Optional Inputs:**
- `issue`: The customer's issue or question
- `channel`: Where this response will be sent (email, chat, social)

---

## Tips for Good Skills

- **Be specific** - Vague instructions lead to inconsistent results
- **List exact document names** - Help Claude find the right docs
- **Define boundaries** - What should Claude NOT do?
- **Think about inputs** - What might vary each time someone uses this skill?

## Submission Process

1. Copy the template above
2. Fill it out completely
3. Send to Michael via Slack or email
4. Michael will add it to the MCP and notify you when it's live

## Questions?

Not sure if your idea would work as a skill? Ask Michael - some workflows might be better served by adding documents to the knowledge base instead of creating a new skill.

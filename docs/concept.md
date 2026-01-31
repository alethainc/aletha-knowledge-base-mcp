# Aletha Knowledge Base MCP - The Concept

## The Idea

It's **Aletha's textbook that Claude can read**.

Instead of copying and pasting from Google Drive, Claude can search and read our documents directly - brand guidelines, policies, marketing materials - so its answers are grounded in *our* company knowledge.

## Why It Matters

- **Claude can't access our docs otherwise** - Without this, Claude only knows what's on the public internet
- **No more copy/pasting** - Just ask Claude to find what you need
- **Brand consistency** - Marketing content uses our actual guidelines, not generic advice
- **Single source of truth** - Everyone references the same documents

## The Vision

```
                              ┌─ Brand guidelines
                              ├─ Marketing materials
              ┌─ What's in it ├─ Policies & procedures
              │               ├─ Reference documents
              │               └─ Approved examples
              │
              │               ┌─ Claude Desktop
              ├─ Who uses it ─┼─ Marketing team
              │               └─ Any employee with Claude
              │
"Aletha's     │               ┌─ "What are our brand colors?"
Textbook" ────┼─ Use cases ───├─ "Write an email using our voice"
              │               ├─ "What's the PTO policy?"
              │               └─ "Find the onboarding docs"
              │
              │               ┌─ No copy/pasting from Drive
              ├─ Why it ──────├─ Claude can't access our docs otherwise
              │   matters     ├─ Ensures brand consistency
              │               └─ Single source of truth
              │
              │               ┌─ Install once, always connected
              └─ The vision ──├─ Ask Claude, get company answers
                              └─ Like giving Claude our internal wiki
```

## How It Works (Simple Version)

1. Our company documents live in Google Drive
2. This tool connects Claude to that folder
3. When you ask Claude about company stuff, it searches and reads the real documents
4. Answers are based on *our* information, not the internet

## Example Conversations

> **You:** "Search the knowledge base for brand guidelines"
> **Claude:** *finds and reads the actual brand guidelines document*

> **You:** "Use the marketing-agent prompt to write a landing page"
> **Claude:** *automatically loads brand guidelines, visual guidelines, and marketing references before helping*

> **You:** "What's our PTO policy?"
> **Claude:** *searches knowledge base, finds HR policy, gives you the real answer*

## The Bottom Line

Every company has tribal knowledge scattered across Google Drive, Notion, wikis, and people's heads. This gives Claude access to ours - so when we ask it questions or ask it to create content, it's working with *Aletha's* knowledge, not generic internet knowledge.

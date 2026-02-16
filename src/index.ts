#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig, loadCoreDocs, Config } from "./config/loader.js";
import { getAuthenticatedClient, AuthClient } from "./google/auth.js";
import { createDriveClient, DriveClient } from "./google/drive.js";
import { searchDocs, formatSearchResults, SearchDocsArgs } from "./tools/search-docs.js";
import { listFolder, formatFolderListing, ListFolderArgs } from "./tools/list-folder.js";
import { readDoc, formatDocContent, ReadDocArgs } from "./tools/read-doc.js";
import { readDocs, formatDocsContent, ReadDocsArgs } from "./tools/read-docs.js";
import { listCoreDocs, formatCoreDocs } from "./tools/list-core.js";
import { getKBMap, formatKBMap } from "./tools/kb-map.js";
import { loadKBMap } from "./config/loader.js";
import { getDocumentRole } from "./utils/document-roles.js";

// Critical docs pre-loaded into prompts so Claude has constraints in context
// from the start, rather than needing to fetch them via tool calls.
// IDs match entries in kb-map.md — update here if they change there.
const CRITICAL_MARKETING_DOCS = [
  "1LZ-4x4ZPdTthGGf8RV67Mt68wXUsUj_4", // Brand Positioning
  "1Wi_ol-uuYkHLJm9ieaHiMFzDFUW5weuP", // Writing Guidelines
  "1LwOyI8-rIBQMrRDZ4mKcStNdJWb6fx2n", // Quick Claims Reference
];

/**
 * Pre-loads documents from Drive and formats them with role labels.
 * Returns the formatted content string and a list of any failed doc IDs.
 * If Drive is unavailable, returns empty content gracefully.
 */
async function preloadDocs(
  docIds: string[]
): Promise<{ content: string; failed: string[] }> {
  try {
    const drive = await getDriveClient();
    const results = await Promise.allSettled(
      docIds.map((id) => readDoc(drive, config, { doc_id: id, format: "markdown" }))
    );

    const sections: string[] = [];
    const failed: string[] = [];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const role = getDocumentRole(result.value.id);
        sections.push(formatDocContent(result.value, role));
      } else {
        failed.push(docIds[i]);
      }
    });

    return { content: sections.join("\n\n---\n\n"), failed };
  } catch (error) {
    console.error("[aletha-mcp] Could not pre-load docs:", error);
    return { content: "", failed: docIds };
  }
}

let config: Config;
let driveClient: DriveClient | null = null;

async function getDriveClient(): Promise<DriveClient> {
  if (!driveClient) {
    const auth = await getAuthenticatedClient(config);
    driveClient = createDriveClient(auth);
  }
  return driveClient;
}

const server = new Server(
  {
    name: "aletha-knowledge-base",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_docs",
        description:
          "Search for documents in the Aletha knowledge base using keywords. Returns matching documents with their IDs, names, types, and paths.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Search query - keywords or phrases to find in documents",
            },
            file_type: {
              type: "string",
              enum: ["document", "spreadsheet", "pdf", "presentation", "all"],
              description: "Filter results by file type (optional, default: all)",
            },
            folder_id: {
              type: "string",
              description: "Limit search to a specific folder ID (optional)",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_folder",
        description:
          "Browse the contents of a folder in the knowledge base. Shows files and subfolders with their IDs and types.",
        inputSchema: {
          type: "object" as const,
          properties: {
            folder_id: {
              type: "string",
              description:
                "Folder ID to list contents of (optional, defaults to knowledge base root)",
            },
            include_subfolders: {
              type: "boolean",
              description: "Include contents of subfolders recursively (default: false)",
            },
          },
        },
      },
      {
        name: "read_doc",
        description:
          "Read the full content of a single document. For loading multiple documents at once, use read_docs instead. Documents are labeled by role: Brand/Marketing docs are CONSTRAINTS (follow exactly), Clinical docs are REFERENCE (cite accurately, never fabricate), Blog content is INSPIRATION (do not copy verbatim), Product docs are SOURCE OF TRUTH (use exact names and instructions).",
        inputSchema: {
          type: "object" as const,
          properties: {
            doc_id: {
              type: "string",
              description: "The document ID (from search_docs or list_folder results)",
            },
            format: {
              type: "string",
              enum: ["text", "markdown", "html"],
              description: "Output format for the document content (default: markdown)",
            },
          },
          required: ["doc_id"],
        },
      },
      {
        name: "read_docs",
        description:
          "Read multiple documents at once by their IDs (max 10). Much faster than calling read_doc repeatedly. Documents are labeled by role: Brand/Marketing docs are CONSTRAINTS (follow exactly), Clinical docs are REFERENCE (cite accurately, never fabricate), Blog content is INSPIRATION (do not copy verbatim), Product docs are SOURCE OF TRUTH (use exact names and instructions).",
        inputSchema: {
          type: "object" as const,
          properties: {
            doc_ids: {
              type: "array",
              items: { type: "string" },
              description: "Array of document IDs to read (max 10)",
            },
            format: {
              type: "string",
              enum: ["text", "markdown", "html"],
              description: "Output format for all documents (default: markdown)",
            },
          },
          required: ["doc_ids"],
        },
      },
      {
        name: "list_core_docs",
        description:
          "List the core documents that are always available. These are essential documents pre-configured by admins for quick access.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "get_kb_map",
        description:
          "Get the knowledge base map — a guide describing what documents are available, what each one is about, and when to use them. Use this to orient yourself in the knowledge base.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Tools that don't require Drive access
  if (name === "get_kb_map") {
    const result = getKBMap();
    return {
      content: [
        {
          type: "text" as const,
          text: formatKBMap(result),
        },
      ],
    };
  }

  try {
    const drive = await getDriveClient();

    switch (name) {
      case "search_docs": {
        const result = await searchDocs(drive, config, args as unknown as SearchDocsArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatSearchResults(result),
            },
          ],
        };
      }

      case "list_folder": {
        const result = await listFolder(drive, config, (args || {}) as unknown as ListFolderArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatFolderListing(result),
            },
          ],
        };
      }

      case "read_doc": {
        const result = await readDoc(drive, config, args as unknown as ReadDocArgs);
        const role = getDocumentRole(result.id);
        return {
          content: [
            {
              type: "text" as const,
              text: formatDocContent(result, role),
            },
          ],
        };
      }

      case "read_docs": {
        const result = await readDocs(drive, config, args as unknown as ReadDocsArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatDocsContent(result),
            },
          ],
        };
      }

      case "list_core_docs": {
        const result = await listCoreDocs();
        return {
          content: [
            {
              type: "text" as const,
              text: formatCoreDocs(result),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// List available resources (core docs as resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const coreDocs = loadCoreDocs();

  const resources = coreDocs.coreDocs.map((doc) => ({
    uri: `aletha://knowledge-base/${doc.id}`,
    mimeType: "text/markdown",
    name: doc.name,
    description: doc.description,
  }));

  // Add KB map as a resource if it exists
  const mapContent = loadKBMap();
  if (mapContent) {
    resources.unshift({
      uri: "aletha://knowledge-base/map",
      mimeType: "text/markdown",
      name: "Knowledge Base Map",
      description: "A guide describing what documents are available in the knowledge base, what each one is about, and when to use them.",
    });
  }

  return { resources };
});

// Read a resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Parse the URI to get the doc ID
  const match = uri.match(/^aletha:\/\/knowledge-base\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const docId = match[1];

  // Handle the KB map resource
  if (docId === "map") {
    const result = getKBMap();
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: formatKBMap(result),
        },
      ],
    };
  }

  try {
    const drive = await getDriveClient();
    const result = await readDoc(drive, config, { doc_id: docId, format: "markdown" });
    const role = getDocumentRole(docId);

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: formatDocContent(result, role),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read resource: ${errorMessage}`);
  }
});

// Define available prompts
const PROMPTS = {
  "marketing-agent": {
    name: "marketing-agent",
    description: "Marketing creation agent for landing pages and emails. Automatically loads Aletha brand guidelines, visual/layout guidelines, and approved marketing references.",
    arguments: [
      {
        name: "task",
        description: "The marketing creation task (e.g., landing page copy, marketing email)",
        required: false,
      },
    ],
  },
  "kb-init": {
    name: "kb-init",
    description: "Initialize context with the knowledge base map. Loads a guide describing what documents are available, how to categorize them, and when to use them.",
    arguments: [
      {
        name: "task_context",
        description: "What you're working on (e.g., 'creating a landing page', 'writing clinical content'). Helps frame which documents are most relevant.",
        required: false,
      },
    ],
  },
  "website-guide": {
    name: "website-guide",
    description: "Website guide creation agent optimized for AEO (Answer Engine Optimization) and SEO. Provides format requirements, templates, and best practices for Aletha Health website guides.",
    arguments: [
      {
        name: "topic",
        description: "The guide topic or condition to write about (e.g., 'tight hip flexors', 'SI joint pain', 'yoga and hip pain')",
        required: false,
      },
      {
        name: "guide_type",
        description: "The type of guide: condition, activity, product, comparison, or method (defaults to condition)",
        required: false,
      },
    ],
  },
};

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: Object.values(PROMPTS),
  };
});

// Get a specific prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const prompt = PROMPTS[name as keyof typeof PROMPTS];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  switch (name) {
    case "kb-init": {
      const mapResult = getKBMap();
      const mapContent = formatKBMap(mapResult);
      const taskContext = args?.task_context;

      const contextLine = taskContext
        ? `\nYour current task: ${taskContext}. Pay special attention to documents relevant to this work.\n`
        : "";

      return {
        description: prompt.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `You have access to the Aletha knowledge base through MCP tools. Below is a map of what's available — the documents, their categories, and when to use them.

Brand guidelines, writing rules, and approved claims are mandatory constraints — follow them exactly. Clinical documents are reference material — cite accurately, never fabricate. Blog content is for inspiration only — do not copy verbatim.
${contextLine}
---

${mapContent}

---

Use \`read_doc\` with a document ID to load specific documents when needed.`,
            },
          },
        ],
      };
    }

    case "marketing-agent": {
      const task = args?.task || "create marketing content";
      const { content: preloaded, failed } = await preloadDocs(CRITICAL_MARKETING_DOCS);

      const failedNote =
        failed.length > 0
          ? `\n\n> **Note:** ${failed.length} document(s) could not be pre-loaded. Use \`read_doc\` with these IDs to load them manually: ${failed.map((id) => `\`${id}\``).join(", ")}\n`
          : "";

      const preloadedSection = preloaded
        ? `## Pre-loaded Brand Guidelines

The following documents have been loaded automatically. Each is labeled with its role — follow the instruction on each label.

${preloaded}

---
${failedNote}`
        : `## Load Brand Guidelines

Pre-loading failed. Use \`get_kb_map\` to see available documents, then load these with \`read_doc\`:
1. **Brand Positioning** — core brand voice and differentiators
2. **Writing Guidelines** — tone, style, and copy standards
3. **Quick Claims Reference** — approved product/health claims
`;

      return {
        description: prompt.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `## Marketing Creation Agent

This agent creates marketing content for Aletha Health. The essential brand guidelines have been pre-loaded below — follow them in all output.

${preloadedSection}

## Loading Additional Context

If your task requires more context, use \`get_kb_map\` to see what's available, then \`read_doc\` to load specific documents. Common additions:
- **Scroll-Stoppers & Messaging Ideas** — for ads, social posts, or email subject lines
- **Customer Personas** — when targeting a specific audience segment

Do NOT use web search or external sources — all content comes from the Aletha knowledge base.

## Scope Boundaries

**Include:** Brand guidelines, writing guidelines, approved marketing claims, customer personas/journeys
**Exclude:** Clinical white papers, product manuals, finance documents, web searches (unless explicitly requested)

## What This Agent Does

- Follows brand voice and writing style rules from the pre-loaded guidelines
- Uses only approved claims from the Quick Claims Reference
- Matches tone and terminology to Aletha standards
- Delivers draft content for human review and iteration

## Process

1. Read the pre-loaded guidelines above carefully
2. Load additional documents if the task requires them
3. Create the requested content following all brand constraints
4. Run the compliance check below before delivering

## Before Delivering Output

Review your output against the pre-loaded guidelines and confirm each item:

1. All product/health claims appear in the Quick Claims Reference
2. Tone matches Writing Guidelines (no banned words, correct voice)
3. Product names are exact: **Hip Hook Mark**, **Range**, **Orbit**, **Band**
4. No fabricated clinical claims — every medical statement is from a loaded document
5. Brand positioning and differentiators are consistent with Brand Positioning doc

Flag any deviations you cannot resolve. Include this checklist (pass/fail per item) at the end of your response.

## Current Task
${task}

---
**REMINDERS — Do not ignore these:**
- Use ONLY claims from the Quick Claims Reference — no inventing benefits
- Product names exactly: Hip Hook Mark, Range, Orbit, Band
- No superlatives ("best", "revolutionary", "groundbreaking") unless in approved claims
- Medical disclaimer required on all health content`,
            },
          },
        ],
      };
    }

    case "website-guide": {
      const topic = args?.topic || "a health/wellness topic";
      const guideType = args?.guide_type || "condition";
      const { content: preloaded, failed } = await preloadDocs(CRITICAL_MARKETING_DOCS);

      const failedNote =
        failed.length > 0
          ? `\n> **Note:** ${failed.length} brand doc(s) could not be pre-loaded. Use \`read_doc\` to load them manually: ${failed.map((id) => `\`${id}\``).join(", ")}\n`
          : "";

      const preloadedSection = preloaded
        ? `## Pre-loaded Brand Guidelines

The following brand documents have been loaded automatically. Follow them as indicated by their role labels.

${preloaded}

---
${failedNote}`
        : `## Load Brand Guidelines

Pre-loading failed. Use \`get_kb_map\` to find and load Brand Positioning, Writing Guidelines, and Quick Claims Reference before starting.
`;

      return {
        description: prompt.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `## Aletha Health Website Guide Creation Agent

This agent creates website guides optimized for both Answer Engine Optimization (AEO) and Search Engine Optimization (SEO). All content is designed to perform well in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews) while also ranking in traditional search.

${preloadedSection}

## Additional Context Loading

Brand guidelines are pre-loaded above. Before creating the guide, also load topic-specific context using the MCP tools:

1. **Existing guides for reference** - Use \`search_docs\` with the topic name to find similar content
2. **Clinical/medical references** - Use \`search_docs\` with the condition/topic name to find supporting documentation

**IMPORTANT:** Use the \`search_docs\` and \`read_doc\` tools from the aletha-knowledge-base MCP server.

---

## Content Requirements

### E-E-A-T Requirements (Critical for Health/YMYL Content)

**Experience**
- Include real-world patient scenarios or case examples (anonymized)
- Reference Christine's 25 years of physical therapy experience
- Add first-hand observations from clinical practice
- Include "what I've seen in my practice" insights

**Expertise**
- Author attribution: Christine Annie, MPT (Physical Therapist)
- Include author bio with credentials at top or bottom
- Reference relevant certifications and specializations
- Link to Christine's about/credentials page

**Authoritativeness**
- Cite peer-reviewed sources where applicable (PubMed, medical journals)
- Reference established medical organizations (NIH, Mayo Clinic, etc.)
- Include internal links to related Aletha Health content
- Date published and last updated clearly displayed

**Trustworthiness**
- Include medical disclaimer: "This information is not a substitute for professional medical advice. Consult a healthcare provider for personal guidance."
- Transparent about product recommendations (disclose Aletha affiliation)
- Accurate, fact-checked information
- Clear contact information accessible

---

### AEO (Answer Engine Optimization) Requirements

**Direct Answer Format**
- Lead with a concise, direct answer in the first 1-2 sentences
- Answer the primary question within the first 50 words
- Use the "answer-first" structure (conclusion → supporting details)

**Question-Based Structure**
- Main H1 should be the primary question or include the question
- Use H2s formatted as questions users actually ask
- Include a "Quick Answer" or "Key Takeaway" box at the top

**LLM-Friendly Formatting**
- Clear, logical hierarchy (H1 → H2 → H3)
- Short paragraphs (2-4 sentences max)
- Bullet points for lists, comparison tables for alternatives
- Definition boxes for key terms

**Citation-Ready Content**
- Each major claim should be extractable as a standalone answer
- Include specific data points, statistics, and timeframes
- Make brand mentions natural and contextual (Aletha devices as solutions)

---

### SEO Requirements

**Keyword Optimization**
- Primary keyword in H1 title
- Primary keyword in first 100 words
- Secondary/related keywords in H2s
- Natural keyword density (avoid stuffing)
- Long-tail question keywords included

**Meta Elements**
- Meta title: 50-60 characters, includes primary keyword
- Meta description: 150-160 characters, includes CTA and keyword
- URL slug: short, keyword-rich, no stop words

**Content Depth**
- Minimum 1,500 words for comprehensive guides
- Cover topic comprehensively (topical authority)
- Address related questions and subtopics
- Include "People Also Ask" questions as H2s

**Internal/External Linking**
- 3-5 internal links to related Aletha content
- 2-3 external links to authoritative sources
- Anchor text is descriptive (not "click here")

---

### Schema Markup Requirements

Include these schema types:

**MedicalWebPage Schema:**
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "MedicalWebPage",
  "name": "[Guide Title]",
  "description": "[Meta description]",
  "url": "[Full URL]",
  "datePublished": "[YYYY-MM-DD]",
  "dateModified": "[YYYY-MM-DD]",
  "author": {
    "@type": "Person",
    "@id": "https://alethahealth.com/about-christine-annie",
    "name": "Christine Annie, MPT",
    "jobTitle": "Physical Therapist",
    "description": "Physical therapist with 25 years of experience, founder of Aletha Health"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Aletha Health",
    "logo": {
      "@type": "ImageObject",
      "url": "https://alethahealth.com/logo.png"
    }
  }
}
\`\`\`

**FAQPage Schema** for FAQ sections and **HowTo Schema** for instructional content.

---

## Guide Templates by Type

${guideType === "condition" ? `### Template: Condition Guide

\`\`\`
# [Condition Name]: The Complete Guide to Understanding and Treating [Condition]

## Quick Answer
[Direct answer: What causes this condition and how to address it - 2-3 sentences max]

## What You'll Learn
- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]

---

## What is [Condition]?
[Definition and overview - 100 words max]

## What Causes [Condition]?
[Explanation with bulleted list of causes]

### The Hidden Cause Most People Miss: Muscle Tension
[Explain the muscle tension connection - this is your differentiator]

## Symptoms of [Condition]
[Bulleted list of common symptoms]

## What Most People Try (That Doesn't Work Long-Term)
[Acknowledge common treatments, explain limitations]

## How to Actually Fix [Condition]: The Aletha Health Method

### Step 1: Release the Tight Muscles
[Instructions, which muscles, how long]

### Step 2: Restore Alignment
[What this means, how to do it]

### Step 3: Strengthen and Stabilize
[Exercises, progression]

## How Aletha Tools Can Help
[Natural product integration - Hip Hook/Mark, Range, Orbit as applicable]

## How Long Does Recovery Take?
[Realistic timeline, what affects it]

## When to See a Professional
[Red flags, when self-treatment isn't enough]

## Frequently Asked Questions
[3-5 FAQs minimum]

## Key Takeaways
[3-5 bullet summary]

---

## About the Author
**Christine Annie, MPT**
[Author bio]

## Medical Disclaimer
[Standard disclaimer]

## References
[Citations]

**Last Updated:** [Date]
\`\`\`` : guideType === "activity" ? `### Template: Activity/Lifestyle Guide

\`\`\`
# [Activity] and [Pain Type]: Why It Happens and How to Prevent It

## Quick Answer
[Direct answer about why this activity causes this issue and what to do - 2-3 sentences]

## What You'll Learn
- Why [activity] causes [problem]
- Pre-[activity] routine to prevent issues
- Post-[activity] recovery protocol
- Long-term solutions

---

## Why Does [Activity] Cause [Problem]?
[Explanation of biomechanics, muscle tension development]

### The Muscles Most Affected by [Activity]
[List with brief explanations]

## Warning Signs You're Developing a Problem
[Early symptoms to watch for]

## Prevention: Your Pre-[Activity] Routine
[Step-by-step warm-up/preparation]

### 5-Minute Quick Prep
[Abbreviated version]

## Recovery: Your Post-[Activity] Routine
[Step-by-step recovery protocol]

### Using Aletha Tools for Recovery
[Product integration]

## Long-Term Solutions for [Activity] Enthusiasts
[Ongoing maintenance]

## Common Mistakes [Activity Participants] Make
[What to avoid]

## Frequently Asked Questions
[3-5 FAQs]

## Key Takeaways
[Summary points]

---

## About the Author
**Christine Annie, MPT**

**Last Updated:** [Date]
\`\`\`` : guideType === "product" ? `### Template: Product Education Guide

\`\`\`
# How to Use the [Product Name]: Complete Guide for Best Results

## Quick Answer
[What the product does and the key to using it effectively - 2-3 sentences]

## What You'll Learn
- Why the [Product] works
- Step-by-step usage instructions
- Pro tips from 25 years of clinical experience
- Common mistakes to avoid
- Troubleshooting guide

---

## Why the [Product] Works
[Mechanism of action, why prolonged pressure is effective]

### The Science Behind Prolonged Pressure
[Brief explanation with citation]

## Before You Start: Setup
[Preparation, positioning, what you need]

## How to Use the [Product]: Step-by-Step

### Step 1: [First Step]
[Detailed instructions]
**What you should feel:** [Expected sensation]

### Step 2: [Second Step]
[Detailed instructions]
**What you should feel:** [Expected sensation]

[Continue as needed]

## Pro Tips from Christine
[Clinical insights, advanced techniques]

## Common Mistakes to Avoid
[Bulleted list]

## What's Normal vs. What's Not

### Normal Sensations
[List]

### Stop If You Experience
[Red flags]

## Progression: Taking It Further
[How to advance, frequency]

## Troubleshooting
[Common issues and solutions]

## Frequently Asked Questions
[3-5 FAQs]

## Key Takeaways
[Summary]

---

## About the Author
**Christine Annie, MPT**

**Last Updated:** [Date]
\`\`\`` : guideType === "comparison" ? `### Template: Comparison Guide

\`\`\`
# [Method/Tool A] vs. [Method/Tool B]: Which Is Better for [Goal]?

## Quick Answer
[Direct comparison verdict - when to use each - 2-3 sentences]

## Comparison at a Glance

| Factor | [Method A] | [Method B] |
|--------|------------|------------|
| Best for | [Use case] | [Use case] |
| Mechanism | [How it works] | [How it works] |
| Effectiveness | [Assessment] | [Assessment] |
| Time required | [Duration] | [Duration] |
| Cost | [Range] | [Range] |
| Learning curve | [Rating] | [Rating] |
| Can do at home | [Yes/No] | [Yes/No] |

---

## What is [Method A]?
[Brief explanation]

### Pros of [Method A]
[List]

### Cons of [Method A]
[List]

## What is [Method B]?
[Brief explanation]

### Pros of [Method B]
[List]

### Cons of [Method B]
[List]

## When to Use [Method A]
[Specific scenarios]

## When to Use [Method B]
[Specific scenarios]

## Can You Use Both Together?
[Complementary use cases]

## What the Research Says
[Citations and evidence]

## The Bottom Line
[Summary recommendation]

## Frequently Asked Questions
[3-5 FAQs]

---

## About the Author
**Christine Annie, MPT**

## References
[Citations]

**Last Updated:** [Date]
\`\`\`` : `### Template: Method/Educational Guide

\`\`\`
# [Foundational Topic]: What It Is, Why It Matters, and How to Address It

## Quick Answer
[Core concept explained simply - 2-3 sentences]

## What You'll Learn
- [Learning objective 1]
- [Learning objective 2]
- [Learning objective 3]

---

## What is [Topic]?
[Clear definition with analogy if helpful]

### [Topic] vs. [Related/Confused Concept]
[Clarify distinction]

## Why Does [Topic] Develop?
[Causes organized by category]

## How [Topic] Affects Your Body
[Effects organized by body system/area]

## The Aletha Health Approach to [Topic]
[Your methodology]

### Principle 1: [Core Principle]
[Explanation]

### Principle 2: [Core Principle]
[Explanation]

## How to Apply This Knowledge
[Practical application]

## Frequently Asked Questions
[3-5 FAQs]

## Key Takeaways
[Summary points]

## Related Guides
[Links to related content]

---

## About the Author
**Christine Annie, MPT**

## Medical Disclaimer
[Standard disclaimer]

## References
[Citations]

**Last Updated:** [Date]
\`\`\``}

---

## Content Quality Standards

### Voice & Tone
- **Authoritative but accessible**: Expert knowledge in plain language
- **Empathetic**: Acknowledge pain/frustration readers are experiencing
- **Solution-oriented**: Focus on actionable relief
- **Honest**: Acknowledge limitations of self-treatment

### Writing Guidelines
- Use second person ("you") to address reader directly
- Active voice preferred
- Reading level: 8th-10th grade
- Avoid jargon without explanation
- Include analogies for complex anatomical concepts

### Unique Value Requirements
Each guide must include at least 2 of these elements:
- Original clinical insight from Christine's experience
- Unique data or survey findings from Aletha users
- Custom illustrations or diagrams (note where needed)
- Video demonstrations (note where needed)
- Downloadable resources (checklists, guides)

---

## Pre-Publish Checklist

**Content Quality**
- [ ] Direct answer appears in first 50 words
- [ ] Reading level checked (8th-10th grade)
- [ ] Unique value element present

**E-E-A-T**
- [ ] Author attribution (Christine Annie, MPT)
- [ ] Author bio with credentials
- [ ] Medical disclaimer included

**AEO Optimization**
- [ ] Question-based H2s
- [ ] FAQ section with 3-5 questions
- [ ] Clear, extractable answers

**SEO Optimization**
- [ ] Primary keyword in H1, first 100 words, URL
- [ ] Meta title 50-60 characters
- [ ] Meta description 150-160 characters
- [ ] Internal links (minimum 3)
- [ ] External authoritative links (minimum 2)

**Technical**
- [ ] Schema markup specified
- [ ] Image alt text noted
- [ ] Mobile-friendly structure

---

## Before Delivering Output

After writing the guide, review it against the pre-loaded brand guidelines and this checklist. Confirm each item passes or flag deviations:

**Brand Compliance**
1. All product/health claims appear in the Quick Claims Reference
2. Tone matches Writing Guidelines (no banned words, correct voice)
3. Product names are exact: **Hip Hook Mark**, **Range**, **Orbit**, **Band**
4. No fabricated clinical claims — every medical statement is from a loaded document

**Content Quality**
5. Direct answer appears in first 50 words
6. Reading level: 8th-10th grade
7. Author attribution: Christine Annie, MPT
8. Medical disclaimer included

**AEO/SEO**
9. Question-based H2s with FAQ section (3-5 questions)
10. Meta title (50-60 chars), meta description (150-160 chars), URL slug
11. Internal links (min 3) and external authoritative links (min 2)

Include this checklist (pass/fail per item) at the end of your response.

---

## Current Task

**Topic:** ${topic}
**Guide Type:** ${guideType}

Create a comprehensive website guide following the format, requirements, and template above. Load any relevant clinical or topic-specific content from the knowledge base first.

---
**REMINDERS — Do not ignore these:**
- Use ONLY claims from the Quick Claims Reference — no inventing benefits
- Product names exactly: Hip Hook Mark, Range, Orbit, Band
- No superlatives ("best", "revolutionary", "groundbreaking") unless in approved claims
- Medical disclaimer required on all health content
- Author attribution: Christine Annie, MPT on every guide`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Prompt not implemented: ${name}`);
  }
});

// Main entry point
async function main() {
  try {
    // Load configuration
    config = loadConfig();
    const authType = config.google.authType || "oauth";
    console.error(`[aletha-mcp] Loaded configuration for: ${config.knowledgeBase.rootFolderName}`);
    console.error(`[aletha-mcp] Authentication type: ${authType}`);

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[aletha-mcp] Server started successfully");
  } catch (error) {
    console.error("[aletha-mcp] Failed to start:", error);
    process.exit(1);
  }
}

main();

import { loadKBMap } from "../config/loader.js";

export interface DocumentRole {
  category: string;
  label: string;
  instruction: string;
}

/**
 * Maps kb-map section headers to role labels that tell Claude
 * HOW to use each document (constraint vs. reference vs. inspiration).
 */
const ROLE_LABELS: Record<string, { label: string; instruction: string }> = {
  "Brand & Marketing": {
    label: "MANDATORY CONSTRAINTS",
    instruction:
      "You MUST follow every rule in this document. These are brand standards, not suggestions.",
  },
  "Customer Personas & Journeys": {
    label: "CONTEXT",
    instruction:
      "Use this to understand your audience. Inform tone and framing from these insights.",
  },
  "Clinical & Research": {
    label: "REFERENCE — CITE ACCURATELY",
    instruction:
      "Use exact claims from this document. Never fabricate or paraphrase medical claims.",
  },
  "Topic Articles & Blog Content": {
    label: "REFERENCE ONLY — DO NOT COPY",
    instruction:
      "Use for tone and structure inspiration only. Do not copy verbatim.",
  },
  Product: {
    label: "SOURCE OF TRUTH",
    instruction:
      "Use exact product names, usage instructions, and capabilities from this document.",
  },
};

let cachedIndex: Map<string, string> | null = null;

/**
 * Parses the kb-map markdown to build a docId → category mapping.
 * Relies on the consistent format:
 *   ## Category Name
 *   - **Doc Name** (id: `docId`, type)
 */
function parseKBMap(content: string): Map<string, string> {
  const docIdToCategory = new Map<string, string>();
  let currentCategory = "";

  for (const line of content.split("\n")) {
    // Match section headers: "## Brand & Marketing"
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim();
      continue;
    }

    // Match doc entries containing an id: `...` pattern
    const docMatch = line.match(/id:\s*`([^`]+)`/);
    if (docMatch && currentCategory) {
      docIdToCategory.set(docMatch[1], currentCategory);
    }
  }

  return docIdToCategory;
}

function getIndex(): Map<string, string> {
  if (!cachedIndex) {
    const content = loadKBMap();
    cachedIndex = content ? parseKBMap(content) : new Map();
  }
  return cachedIndex;
}

/**
 * Look up the role label for a document by its ID.
 * Returns null if the document isn't in the kb-map or its category has no role defined.
 */
export function getDocumentRole(docId: string): DocumentRole | null {
  const index = getIndex();
  const category = index.get(docId);
  if (!category) return null;

  const roleLabel = ROLE_LABELS[category];
  if (!roleLabel) return null;

  return { category, ...roleLabel };
}

/** Reset the cached index (useful if kb-map changes at runtime). */
export function resetRoleCache(): void {
  cachedIndex = null;
}

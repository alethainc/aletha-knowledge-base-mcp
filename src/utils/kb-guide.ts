import { loadKBGuide } from "../config/loader.js";
import { getDocumentRole } from "./document-roles.js";

interface ParsedGuide {
  global: string;
  categories: Map<string, string>;
}

let cachedGuide: ParsedGuide | null = null;

/**
 * Parses kb-guide.md into global and category-specific sections.
 * Section headers (## Category Name) must match kb-map.md category names.
 * The ## Global section is special — its contents always apply.
 */
function parseGuide(content: string): ParsedGuide {
  const guide: ParsedGuide = { global: "", categories: new Map() };
  let currentSection = "";
  let currentLines: string[] = [];

  function flushSection() {
    const text = currentLines.join("\n").trim();
    if (!text) return;

    if (currentSection.toLowerCase() === "global") {
      guide.global = text;
    } else if (currentSection) {
      guide.categories.set(currentSection, text);
    }
  }

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      flushSection();
      currentSection = sectionMatch[1].trim();
      currentLines = [];
      continue;
    }

    // Skip the top-level title
    if (line.match(/^# /)) continue;

    currentLines.push(line);
  }

  // Flush the last section
  flushSection();

  return guide;
}

function getGuide(): ParsedGuide | null {
  if (!cachedGuide) {
    const content = loadKBGuide();
    if (!content) return null;
    cachedGuide = parseGuide(content);
  }
  return cachedGuide;
}

/**
 * Returns corrections relevant to a specific document:
 * global corrections + the document's category-specific corrections.
 * Uses getDocumentRole() to find the doc's category from the kb-map.
 */
export function getCorrectionsForDoc(docId: string): string | null {
  const guide = getGuide();
  if (!guide) return null;

  const role = getDocumentRole(docId);
  const category = role?.category;

  const parts: string[] = [];

  if (guide.global) {
    parts.push("**Corrections (Global):**\n" + guide.global);
  }

  if (category && guide.categories.has(category)) {
    parts.push(
      `**Corrections (${category}):**\n` + guide.categories.get(category)!
    );
  }

  if (parts.length === 0) return null;

  return parts.join("\n\n");
}

/**
 * Returns the full guide content for injection into prompts.
 * Includes all sections (global + every category).
 */
export function getFullGuide(): string | null {
  const guide = getGuide();
  if (!guide) return null;

  const parts: string[] = [];

  if (guide.global) {
    parts.push("### Global\n" + guide.global);
  }

  for (const [category, content] of guide.categories) {
    parts.push(`### ${category}\n` + content);
  }

  if (parts.length === 0) return null;

  return parts.join("\n\n");
}

/** Clear the cached guide (useful if kb-guide changes at runtime). */
export function resetGuideCache(): void {
  cachedGuide = null;
}

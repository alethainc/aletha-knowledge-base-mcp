import { loadKBGuide, getKBGuidePath } from "../config/loader.js";

export interface KBGuideResult {
  content: string;
  found: boolean;
  path: string;
}

export function getKBGuide(): KBGuideResult {
  const content = loadKBGuide();
  return {
    content: content || "",
    found: content !== null,
    path: getKBGuidePath(),
  };
}

export function formatKBGuide(result: KBGuideResult): string {
  if (!result.found) {
    return (
      `No knowledge base guide found.\n\n` +
      `Create a guide file at \`${result.path}\` to provide corrections and usage guidelines.\n` +
      `The guide is a markdown file with sections matching kb-map categories ` +
      `(## Global, ## Brand & Marketing, etc.) containing documented error corrections.`
    );
  }
  return result.content;
}

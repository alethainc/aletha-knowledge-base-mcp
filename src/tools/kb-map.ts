import { loadKBMap, getKBMapPath } from "../config/loader.js";

export interface KBMapResult {
  content: string;
  found: boolean;
  path: string;
}

export function getKBMap(): KBMapResult {
  const content = loadKBMap();
  return {
    content: content || "",
    found: content !== null,
    path: getKBMapPath(),
  };
}

export function formatKBMap(result: KBMapResult): string {
  if (!result.found) {
    return (
      `No knowledge base map found.\n\n` +
      `Create a map file at \`${result.path}\` to provide orientation for the knowledge base.\n` +
      `The map is a markdown file that describes what documents are available, ` +
      `what each one is about, and when to use them.`
    );
  }
  return result.content;
}

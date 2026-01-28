import { loadCoreDocs, CoreDoc } from "../config/loader.js";

export interface ListCoreDocsResult {
  coreDocs: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
  }>;
  totalCount: number;
}

export async function listCoreDocs(): Promise<ListCoreDocsResult> {
  const config = loadCoreDocs();

  return {
    coreDocs: config.coreDocs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      description: doc.description,
      category: doc.category,
    })),
    totalCount: config.coreDocs.length,
  };
}

export function formatCoreDocs(result: ListCoreDocsResult): string {
  if (result.totalCount === 0) {
    return "No core documents configured. Add documents to core-docs.json to make them always available.";
  }

  const lines = [
    `**Core Documents (${result.totalCount}):**`,
    "",
    "These documents are always available and can be loaded for context:",
    "",
  ];

  // Group by category
  const byCategory: Record<string, typeof result.coreDocs> = {};
  for (const doc of result.coreDocs) {
    const category = doc.category || "Uncategorized";
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(doc);
  }

  for (const [category, docs] of Object.entries(byCategory)) {
    lines.push(`### ${category}`);
    for (const doc of docs) {
      lines.push(`- **${doc.name}** (id: \`${doc.id}\`)`);
      lines.push(`  ${doc.description}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Use `read_doc` with the document ID to load a document into context.*");

  return lines.join("\n");
}

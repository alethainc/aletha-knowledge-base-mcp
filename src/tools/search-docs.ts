import { DriveClient, searchFiles, SearchResult } from "../google/drive.js";
import { Config } from "../config/loader.js";
import { getMimeTypeDescription } from "../utils/file-converter.js";

export interface SearchDocsArgs {
  query: string;
  file_type?: "document" | "spreadsheet" | "pdf" | "presentation" | "all";
  folder_id?: string;
  max_results?: number;
}

export interface SearchDocsResult {
  results: Array<{
    id: string;
    name: string;
    type: string;
    mimeType: string;
    modifiedTime: string;
    path: string;
    webViewLink: string;
  }>;
  totalResults: number;
  query: string;
}

export async function searchDocs(
  drive: DriveClient,
  config: Config,
  args: SearchDocsArgs
): Promise<SearchDocsResult> {
  const { query, file_type, folder_id, max_results } = args;

  if (!query || query.trim().length === 0) {
    throw new Error("Search query is required");
  }

  const results = await searchFiles(drive, config, query, {
    fileType: file_type,
    folderId: folder_id,
    maxResults: max_results || config.defaults.maxSearchResults,
  });

  return {
    results: results.map((r) => ({
      id: r.id,
      name: r.name,
      type: getMimeTypeDescription(r.mimeType),
      mimeType: r.mimeType,
      modifiedTime: r.modifiedTime,
      path: r.path,
      webViewLink: r.webViewLink,
    })),
    totalResults: results.length,
    query,
  };
}

export function formatSearchResults(result: SearchDocsResult): string {
  if (result.totalResults === 0) {
    return `No documents found matching "${result.query}"`;
  }

  const lines = [
    `Found ${result.totalResults} document(s) matching "${result.query}":`,
    "",
  ];

  for (const doc of result.results) {
    lines.push(`- **${doc.name}** (${doc.type})`);
    lines.push(`  - ID: ${doc.id}`);
    lines.push(`  - Path: ${doc.path}`);
    lines.push(`  - Modified: ${new Date(doc.modifiedTime).toLocaleDateString()}`);
    lines.push(`  - [Open in Drive](${doc.webViewLink})`);
    lines.push("");
  }

  return lines.join("\n");
}

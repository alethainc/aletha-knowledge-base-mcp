import { DriveClient } from "../google/drive.js";
import { Config } from "../config/loader.js";
import { readDoc, formatDocContent, ReadDocResult } from "./read-doc.js";
import { getDocumentRole } from "../utils/document-roles.js";

export interface ReadDocsArgs {
  doc_ids: string[];
  format?: "text" | "markdown" | "html";
}

export interface ReadDocsResult {
  documents: ReadDocResult[];
  errors: { doc_id: string; error: string }[];
}

export async function readDocs(
  drive: DriveClient,
  config: Config,
  args: ReadDocsArgs
): Promise<ReadDocsResult> {
  const { doc_ids, format } = args;

  if (!doc_ids || doc_ids.length === 0) {
    throw new Error("At least one document ID is required");
  }

  if (doc_ids.length > 10) {
    throw new Error("Maximum 10 documents per request to avoid overloading context");
  }

  const results = await Promise.allSettled(
    doc_ids.map((doc_id) => readDoc(drive, config, { doc_id, format }))
  );

  const documents: ReadDocResult[] = [];
  const errors: { doc_id: string; error: string }[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      documents.push(result.value);
    } else {
      errors.push({
        doc_id: doc_ids[i],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return { documents, errors };
}

export function formatDocsContent(result: ReadDocsResult): string {
  const sections: string[] = [];

  if (result.documents.length > 0) {
    sections.push(`Loaded ${result.documents.length} document(s):\n`);
    for (const doc of result.documents) {
      const role = getDocumentRole(doc.id);
      sections.push(formatDocContent(doc, role));
      sections.push("\n---\n");
    }
  }

  if (result.errors.length > 0) {
    sections.push(`\nFailed to load ${result.errors.length} document(s):`);
    for (const err of result.errors) {
      sections.push(`- ${err.doc_id}: ${err.error}`);
    }
  }

  return sections.join("\n");
}

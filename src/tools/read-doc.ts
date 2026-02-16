import { DriveClient, getFileMetadata, getFileContent } from "../google/drive.js";
import { Config } from "../config/loader.js";
import { convertToFormat, OutputFormat, getMimeTypeDescription } from "../utils/file-converter.js";
import { DocumentRole } from "../utils/document-roles.js";

export interface ReadDocArgs {
  doc_id: string;
  format?: "text" | "markdown" | "html";
}

export interface ReadDocResult {
  id: string;
  name: string;
  mimeType: string;
  fileType: string;
  content: string;
  metadata: {
    createdTime: string;
    modifiedTime: string;
    lastModifyingUser?: string;
    size?: string;
    webViewLink: string;
  };
}

export async function readDoc(
  drive: DriveClient,
  config: Config,
  args: ReadDocArgs
): Promise<ReadDocResult> {
  const { doc_id, format = config.defaults.outputFormat } = args;

  if (!doc_id || doc_id.trim().length === 0) {
    throw new Error("Document ID is required");
  }

  // Get file metadata
  const metadata = await getFileMetadata(drive, doc_id);

  if (!metadata.id || !metadata.name || !metadata.mimeType) {
    throw new Error("Failed to retrieve document metadata");
  }

  // Check if it's a folder
  if (metadata.mimeType === "application/vnd.google-apps.folder") {
    throw new Error(
      `"${metadata.name}" is a folder, not a document. Use list_folder to browse its contents.`
    );
  }

  // Get file content
  let rawContent: string | Buffer;
  try {
    rawContent = await getFileContent(drive, doc_id, metadata.mimeType);
  } catch (error) {
    throw new Error(`Failed to read document content: ${error}`);
  }

  // Convert to requested format
  const content = await convertToFormat(
    rawContent,
    metadata.mimeType,
    format as OutputFormat
  );

  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    fileType: getMimeTypeDescription(metadata.mimeType),
    content,
    metadata: {
      createdTime: metadata.createdTime || "",
      modifiedTime: metadata.modifiedTime || "",
      lastModifyingUser: metadata.lastModifyingUser?.displayName || undefined,
      size: metadata.size || undefined,
      webViewLink: metadata.webViewLink || "",
    },
  };
}

export function formatDocContent(result: ReadDocResult, role?: DocumentRole | null): string {
  const lines: string[] = [];

  if (role) {
    lines.push(`# [${role.label}] ${result.name}`);
    lines.push("");
    lines.push(`> **${role.instruction}**`);
  } else {
    lines.push(`# ${result.name}`);
  }

  lines.push("");
  lines.push(`**Type:** ${result.fileType}`);
  lines.push(`**Last Modified:** ${new Date(result.metadata.modifiedTime).toLocaleString()}`);

  if (result.metadata.lastModifyingUser) {
    lines.push(`**Modified By:** ${result.metadata.lastModifyingUser}`);
  }

  lines.push(`**[Open in Drive](${result.metadata.webViewLink})**`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(result.content);

  return lines.join("\n");
}

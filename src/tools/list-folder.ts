import { DriveClient, listFolderContents, FolderContent, FolderInfo } from "../google/drive.js";
import { Config } from "../config/loader.js";
import { getMimeTypeDescription } from "../utils/file-converter.js";

export interface ListFolderArgs {
  folder_id?: string;
  include_subfolders?: boolean;
}

export interface ListFolderResult {
  folder: {
    id: string;
    name: string;
    path: string;
  };
  contents: Array<{
    id: string;
    name: string;
    type: "file" | "folder";
    fileType: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
  }>;
}

export async function listFolder(
  drive: DriveClient,
  config: Config,
  args: ListFolderArgs
): Promise<ListFolderResult> {
  const { folder_id, include_subfolders = false } = args;

  const result = await listFolderContents(
    drive,
    config,
    folder_id,
    include_subfolders
  );

  return {
    folder: result.folder,
    contents: result.contents.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      fileType: getMimeTypeDescription(c.mimeType),
      mimeType: c.mimeType,
      modifiedTime: c.modifiedTime,
      size: c.size,
    })),
  };
}

export function formatFolderListing(result: ListFolderResult): string {
  const lines = [
    `**${result.folder.name}** (${result.folder.path})`,
    "",
  ];

  const folders = result.contents.filter((c) => c.type === "folder");
  const files = result.contents.filter((c) => c.type === "file");

  if (folders.length > 0) {
    lines.push("**Folders:**");
    for (const folder of folders) {
      lines.push(`  - 📁 ${folder.name} (id: ${folder.id})`);
    }
    lines.push("");
  }

  if (files.length > 0) {
    lines.push("**Files:**");
    for (const file of files) {
      const modified = new Date(file.modifiedTime).toLocaleDateString();
      lines.push(`  - 📄 ${file.name} (${file.fileType}, modified: ${modified})`);
      lines.push(`    ID: ${file.id}`);
    }
    lines.push("");
  }

  if (folders.length === 0 && files.length === 0) {
    lines.push("(empty folder)");
  }

  return lines.join("\n");
}

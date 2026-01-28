import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Config } from "../config/loader.js";

export type DriveClient = drive_v3.Drive;

export function createDriveClient(auth: OAuth2Client): DriveClient {
  return google.drive({ version: "v3", auth });
}

export interface SearchResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  path: string;
  webViewLink: string;
  size?: string;
}

export interface FolderContent {
  id: string;
  name: string;
  mimeType: string;
  type: "file" | "folder";
  modifiedTime: string;
  size?: string;
}

export interface FolderInfo {
  id: string;
  name: string;
  path: string;
}

const MIME_TYPE_FILTERS: Record<string, string[]> = {
  document: [
    "application/vnd.google-apps.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  spreadsheet: [
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  presentation: [
    "application/vnd.google-apps.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  pdf: ["application/pdf"],
};

export async function searchFiles(
  drive: DriveClient,
  config: Config,
  query: string,
  options: {
    fileType?: string;
    folderId?: string;
    maxResults?: number;
  } = {}
): Promise<SearchResult[]> {
  const { fileType, folderId, maxResults = config.defaults.maxSearchResults } = options;

  // Build query
  const queryParts: string[] = [];

  // Full-text search
  queryParts.push(`fullText contains '${query.replace(/'/g, "\\'")}'`);

  // Folder scope
  const searchFolderId = folderId || config.knowledgeBase.rootFolderId;
  // Note: This searches within the folder. For recursive search, we'd need to traverse.
  // Google Drive API doesn't have direct recursive search, but fullText search
  // searches within shared drives/folders the user has access to.

  // File type filter
  if (fileType && fileType !== "all" && MIME_TYPE_FILTERS[fileType]) {
    const mimeTypes = MIME_TYPE_FILTERS[fileType];
    const mimeQuery = mimeTypes.map((m) => `mimeType='${m}'`).join(" or ");
    queryParts.push(`(${mimeQuery})`);
  }

  // Exclude trashed files
  queryParts.push("trashed = false");

  const q = queryParts.join(" and ");

  try {
    const response = await drive.files.list({
      q,
      pageSize: maxResults,
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, size, parents)",
      orderBy: "modifiedTime desc",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: config.knowledgeBase.type === "shared_drive" ? "drive" : "user",
      ...(config.knowledgeBase.type === "shared_drive" && {
        driveId: config.knowledgeBase.rootFolderId,
      }),
    });

    const files = response.data.files || [];

    // Get paths for each file
    const results: SearchResult[] = await Promise.all(
      files.map(async (file) => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        modifiedTime: file.modifiedTime!,
        path: await getFilePath(drive, file.id!, file.parents?.[0]),
        webViewLink: file.webViewLink || "",
        size: file.size || undefined,
      }))
    );

    return results;
  } catch (error) {
    throw new Error(`Search failed: ${error}`);
  }
}

export async function listFolderContents(
  drive: DriveClient,
  config: Config,
  folderId?: string,
  includeSubfolders = false
): Promise<{ folder: FolderInfo; contents: FolderContent[] }> {
  const targetFolderId = folderId || config.knowledgeBase.rootFolderId;

  // Get folder info
  const folderResponse = await drive.files.get({
    fileId: targetFolderId,
    fields: "id, name",
    supportsAllDrives: true,
  });

  const folderInfo: FolderInfo = {
    id: folderResponse.data.id!,
    name: folderResponse.data.name!,
    path: await getFilePath(drive, targetFolderId),
  };

  // List contents
  const q = `'${targetFolderId}' in parents and trashed = false`;

  const response = await drive.files.list({
    q,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    orderBy: "folder, name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = response.data.files || [];

  let contents: FolderContent[] = files.map((file) => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
    modifiedTime: file.modifiedTime!,
    size: file.size || undefined,
  }));

  // Recursively get subfolder contents if requested
  if (includeSubfolders) {
    const folders = contents.filter((c) => c.type === "folder");
    for (const folder of folders) {
      const subResult = await listFolderContents(drive, config, folder.id, true);
      contents = contents.concat(
        subResult.contents.map((c) => ({
          ...c,
          name: `${folder.name}/${c.name}`,
        }))
      );
    }
  }

  return { folder: folderInfo, contents };
}

export async function getFileMetadata(
  drive: DriveClient,
  fileId: string
): Promise<drive_v3.Schema$File> {
  const response = await drive.files.get({
    fileId,
    fields:
      "id, name, mimeType, modifiedTime, createdTime, size, webViewLink, lastModifyingUser, parents",
    supportsAllDrives: true,
  });

  return response.data;
}

// Binary MIME types that should not be converted to UTF-8 string
const BINARY_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

export async function getFileContent(
  drive: DriveClient,
  fileId: string,
  mimeType: string
): Promise<string | Buffer> {
  // For Google Workspace files, export to appropriate format
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    return exportGoogleFile(drive, fileId, mimeType);
  }

  // For other files, download directly
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(response.data as ArrayBuffer);

  // Return Buffer for binary files to preserve data integrity
  if (BINARY_MIME_TYPES.includes(mimeType)) {
    return buffer;
  }

  // Convert text-based files to string
  return buffer.toString("utf-8");
}

async function exportGoogleFile(
  drive: DriveClient,
  fileId: string,
  mimeType: string
): Promise<string> {
  let exportMimeType: string;

  switch (mimeType) {
    case "application/vnd.google-apps.document":
      exportMimeType = "text/plain"; // or text/html for richer content
      break;
    case "application/vnd.google-apps.spreadsheet":
      exportMimeType = "text/csv";
      break;
    case "application/vnd.google-apps.presentation":
      exportMimeType = "text/plain";
      break;
    default:
      exportMimeType = "text/plain";
  }

  const response = await drive.files.export(
    { fileId, mimeType: exportMimeType },
    { responseType: "text" }
  );

  return response.data as string;
}

async function getFilePath(
  drive: DriveClient,
  fileId: string,
  parentId?: string
): Promise<string> {
  const pathParts: string[] = [];
  let currentId = parentId;

  // Limit depth to prevent infinite loops
  let depth = 0;
  const maxDepth = 10;

  while (currentId && depth < maxDepth) {
    try {
      const response = await drive.files.get({
        fileId: currentId,
        fields: "id, name, parents",
        supportsAllDrives: true,
      });

      pathParts.unshift(response.data.name!);
      currentId = response.data.parents?.[0];
      depth++;
    } catch {
      break;
    }
  }

  return pathParts.length > 0 ? pathParts.join("/") : "/";
}

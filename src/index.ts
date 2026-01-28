#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig, loadCoreDocs, Config } from "./config/loader.js";
import { getAuthenticatedClient } from "./google/auth.js";
import { createDriveClient, DriveClient } from "./google/drive.js";
import { searchDocs, formatSearchResults, SearchDocsArgs } from "./tools/search-docs.js";
import { listFolder, formatFolderListing, ListFolderArgs } from "./tools/list-folder.js";
import { readDoc, formatDocContent, ReadDocArgs } from "./tools/read-doc.js";
import { listCoreDocs, formatCoreDocs } from "./tools/list-core.js";

let config: Config;
let driveClient: DriveClient | null = null;

async function getDriveClient(): Promise<DriveClient> {
  if (!driveClient) {
    const auth = await getAuthenticatedClient(config);
    driveClient = createDriveClient(auth);
  }
  return driveClient;
}

const server = new Server(
  {
    name: "aletha-knowledge-base",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_docs",
        description:
          "Search for documents in the Aletha knowledge base using keywords. Returns matching documents with their IDs, names, types, and paths.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Search query - keywords or phrases to find in documents",
            },
            file_type: {
              type: "string",
              enum: ["document", "spreadsheet", "pdf", "presentation", "all"],
              description: "Filter results by file type (optional, default: all)",
            },
            folder_id: {
              type: "string",
              description: "Limit search to a specific folder ID (optional)",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_folder",
        description:
          "Browse the contents of a folder in the knowledge base. Shows files and subfolders with their IDs and types.",
        inputSchema: {
          type: "object" as const,
          properties: {
            folder_id: {
              type: "string",
              description:
                "Folder ID to list contents of (optional, defaults to knowledge base root)",
            },
            include_subfolders: {
              type: "boolean",
              description: "Include contents of subfolders recursively (default: false)",
            },
          },
        },
      },
      {
        name: "read_doc",
        description:
          "Read the full content of a document from the knowledge base. Use this to load document content into context for reference.",
        inputSchema: {
          type: "object" as const,
          properties: {
            doc_id: {
              type: "string",
              description: "The document ID (from search_docs or list_folder results)",
            },
            format: {
              type: "string",
              enum: ["text", "markdown", "html"],
              description: "Output format for the document content (default: markdown)",
            },
          },
          required: ["doc_id"],
        },
      },
      {
        name: "list_core_docs",
        description:
          "List the core documents that are always available. These are essential documents pre-configured by admins for quick access.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const drive = await getDriveClient();

    switch (name) {
      case "search_docs": {
        const result = await searchDocs(drive, config, args as unknown as SearchDocsArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatSearchResults(result),
            },
          ],
        };
      }

      case "list_folder": {
        const result = await listFolder(drive, config, (args || {}) as unknown as ListFolderArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatFolderListing(result),
            },
          ],
        };
      }

      case "read_doc": {
        const result = await readDoc(drive, config, args as unknown as ReadDocArgs);
        return {
          content: [
            {
              type: "text" as const,
              text: formatDocContent(result),
            },
          ],
        };
      }

      case "list_core_docs": {
        const result = await listCoreDocs();
        return {
          content: [
            {
              type: "text" as const,
              text: formatCoreDocs(result),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// List available resources (core docs as resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const coreDocs = loadCoreDocs();

  return {
    resources: coreDocs.coreDocs.map((doc) => ({
      uri: `aletha://knowledge-base/${doc.id}`,
      mimeType: "text/markdown",
      name: doc.name,
      description: doc.description,
    })),
  };
});

// Read a resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Parse the URI to get the doc ID
  const match = uri.match(/^aletha:\/\/knowledge-base\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const docId = match[1];

  try {
    const drive = await getDriveClient();
    const result = await readDoc(drive, config, { doc_id: docId, format: "markdown" });

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: formatDocContent(result),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read resource: ${errorMessage}`);
  }
});

// Main entry point
async function main() {
  try {
    // Load configuration
    config = loadConfig();
    console.error(`[aletha-mcp] Loaded configuration for: ${config.knowledgeBase.rootFolderName}`);

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[aletha-mcp] Server started successfully");
  } catch (error) {
    console.error("[aletha-mcp] Failed to start:", error);
    process.exit(1);
  }
}

main();

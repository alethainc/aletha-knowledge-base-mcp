# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode for development
npm start          # Run the compiled server
npm run auth       # Authenticate with Google (OAuth flow)
```

## Architecture

This is an MCP (Model Context Protocol) server that connects Claude to a Google Drive knowledge base. It uses stdio transport for communication.

### Core Components

**Entry Point (`src/index.ts`)**
- Creates MCP server with tools, resources, and prompts capabilities
- Registers request handlers for each capability type
- Lazy-initializes the Google Drive client on first use

**Authentication (`src/google/auth.ts`)**
- Supports two auth modes: OAuth (personal) and Service Account (team deployments)
- Service accounts are preferred for distribution to avoid per-user OAuth setup

**Configuration (`src/config/loader.ts`)**
- Config loaded from `~/.config/aletha-mcp/config.json` or `ALETHA_MCP_CONFIG` env var
- Can also be fully configured via environment variables (see `loadConfigFromEnv()`)
- Core docs defined in `~/.config/aletha-mcp/core-docs.json`

**Tools (`src/tools/`)**
- `search_docs` - Full-text search across the knowledge base
- `list_folder` - Browse folder contents
- `read_doc` - Retrieve document content
- `list_core_docs` - List pre-configured essential documents

**File Conversion (`src/utils/file-converter.ts`)**
- Converts Google Docs, PDFs, DOCX to text/markdown/html
- Uses `pdfjs-dist` (requires Node.js 22+ for Promise.withResolvers)
- Uses `mammoth` for DOCX files
- Uses `turndown` for HTML-to-markdown conversion

### MCP Capabilities

- **Tools**: Search, browse, and read documents
- **Resources**: Core docs exposed as `aletha://knowledge-base/{docId}` URIs
- **Prompts**: Agent templates (e.g., `marketing-agent`) that pre-load relevant context

## Installer Distribution

The `installer/` directory contains scripts for team deployment:
- `install.sh` - curl-based installer (hosted as a GitHub Gist for private repo access)
- `bundle-for-distribution.sh` - Creates distributable zip with server code
- `installer/dist/` - Contains bundled artifacts (gitignored, contains secrets)

The installer bundles Node.js 22.11.0 to ensure pdfjs-dist compatibility.

### Distribution Architecture

```
GitHub (public repo) → Server code
Google Drive → Config with credentials (private)
```

The install script pulls server code directly from GitHub and builds it on the user's machine. Only the config.json (which contains service account credentials) comes from Google Drive.

### Updating for Coworkers

After making code changes:

1. **Commit and push to GitHub**
   ```bash
   git add . && git commit -m "Your changes" && git push
   ```

2. **Coworkers reinstall** by running:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/alethainc/aletha-knowledge-base-mcp/main/installer/install.sh | bash
   ```

That's it! No manual uploads needed. The installer pulls the latest code from GitHub.

### Google Drive (Config Only)

The config.json with service account credentials is stored on Google Drive:
- Config file ID: `1QzBku6dgGNwLwfGxKLmDGIHrewIyGbdn`

Only update this if credentials change.

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server implementation
- `googleapis` - Google Drive API client
- `pdfjs-dist` v5.x - PDF text extraction (requires Node 22+)
- `mammoth` - DOCX conversion
- `turndown` - HTML to markdown

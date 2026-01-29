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
GitHub Gist (install.sh) → Google Drive (server.zip + config.json) → User's machine
```

The repo is private, so `install.sh` is hosted on a public GitHub Gist. The script downloads the server bundle and config from Google Drive.

### Updating the Installer for Coworkers

After making code changes, follow these steps to update the distributed version:

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Rebuild the distribution bundle**
   ```bash
   ./installer/bundle-for-distribution.sh
   ```
   This creates a new `installer/dist/aletha-kb-server.zip`

3. **Upload to Google Drive**
   - Go to Google Drive and find the existing `aletha-kb-server.zip`
   - Right-click → Manage versions → Upload new version
   - Upload the new zip from `installer/dist/aletha-kb-server.zip`
   - This keeps the same file ID so install URLs don't change

4. **Update the Gist (only if install.sh changed)**
   ```bash
   gh gist edit 3bbfef5f54c1de4d0977ef72f9bc817e installer/install.sh
   ```

5. **Coworkers reinstall** by running the same curl command:
   ```bash
   curl -fsSL https://gist.githubusercontent.com/mjcanniffe1/3bbfef5f54c1de4d0977ef72f9bc817e/raw/install.sh | bash
   ```

### Google Drive File IDs

The install script references these Google Drive files (update if you create new files):
- Server zip: `1V07s46KV2iytevyK7W_JPXq67wZ2TBPJ`
- Config: `1QzBku6dgGNwLwfGxKLmDGIHrewIyGbdn`

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server implementation
- `googleapis` - Google Drive API client
- `pdfjs-dist` v5.x - PDF text extraction (requires Node 22+)
- `mammoth` - DOCX conversion
- `turndown` - HTML to markdown

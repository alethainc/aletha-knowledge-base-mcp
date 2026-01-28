# Aletha Knowledge Base MCP

An MCP (Model Context Protocol) server that connects Claude Code to Aletha's Google Drive knowledge base.

## Quick Start (Aletha Team)

1. Clone this repo and install:
   ```bash
   git clone git@github.com:alethainc/aletha-knowledge-base-mcp.git
   cd aletha-knowledge-base-mcp
   npm install && npm run build
   ```

2. Get the config file from a team member and save to:
   ```
   ~/.config/aletha-mcp/config.json
   ```

3. Authenticate with your Google account:
   ```bash
   npm run auth
   ```

4. Register with Claude Code:
   ```bash
   claude mcp add aletha-knowledge-base -- node "$(pwd)/dist/index.js"
   ```

5. Verify it works:
   ```bash
   claude mcp list
   ```

---

## Features

- **Search documents** - Find documents by keywords across the knowledge base
- **Browse folders** - Navigate the folder structure
- **Read documents** - Load document content into Claude's context
- **Core documents** - Quick access to essential, pre-configured documents
- **Multiple formats** - Supports Google Docs, Sheets, Slides, PDFs, and Office files

## Prerequisites

- Node.js 18+
- A Google Cloud project with Drive API enabled
- OAuth 2.0 credentials (Desktop app type)
- Access to the target Google Drive folder/shared drive

## Installation

1. **Clone and install dependencies:**

```bash
cd aletha-knowledge-base-mcp
npm install
```

2. **Build the project:**

```bash
npm run build
```

3. **Set up Google Cloud credentials:**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the **Google Drive API**
   - Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
   - Choose **Desktop app** as the application type
   - Download the credentials

4. **Configure the MCP:**

Create `~/.config/aletha-mcp/config.json`:

```json
{
  "knowledgeBase": {
    "rootFolderId": "YOUR_FOLDER_ID",
    "rootFolderName": "Aletha Knowledge Base",
    "type": "folder"
  },
  "google": {
    "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "redirectUri": "http://localhost:3000/oauth/callback"
  },
  "defaults": {
    "maxSearchResults": 10,
    "outputFormat": "markdown"
  }
}
```

To find your folder ID: Open the folder in Google Drive and copy the ID from the URL:
`https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID`

5. **Authenticate with Google:**

```bash
npm run auth
```

This opens a browser for Google OAuth. Sign in and authorize access.

6. **Add to Claude Code:**

```bash
claude mcp add aletha-knowledge-base -- node "/path/to/aletha-knowledge-base-mcp/dist/index.js"
```

Verify it's connected:

```bash
claude mcp list
```

## Usage

Once configured, you can use these tools in Claude Code:

### Search Documents

```
search_docs(query: "brand guidelines")
search_docs(query: "PTO policy", file_type: "document")
```

### Browse Folders

```
list_folder()  // List root folder
list_folder(folder_id: "abc123")  // List specific folder
```

### Read Documents

```
read_doc(doc_id: "abc123xyz")
read_doc(doc_id: "abc123xyz", format: "text")
```

### List Core Documents

```
list_core_docs()
```

## Core Documents

Configure frequently-used documents in `~/.config/aletha-mcp/core-docs.json`:

```json
{
  "coreDocs": [
    {
      "id": "1abc123xyz",
      "name": "Brand Guidelines",
      "description": "Logo usage, colors, typography, and brand voice",
      "category": "Brand"
    },
    {
      "id": "2def456abc",
      "name": "Employee Handbook",
      "description": "Company policies and procedures",
      "category": "Policy"
    }
  ]
}
```

These documents appear as MCP resources and can be quickly loaded into context.

## Troubleshooting

### "No authentication tokens found"

Run `npm run auth` to authenticate with Google.

### "Access token expired"

The MCP automatically refreshes tokens. If it fails, run `npm run auth --force`.

### "Configuration file not found"

Create the config file at `~/.config/aletha-mcp/config.json` or set `ALETHA_MCP_CONFIG` environment variable.

### Search returns no results

- Verify the folder ID is correct
- Ensure your Google account has access to the folder
- Check that documents are not in trash

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Run directly
npm start
```

## Security

- OAuth tokens are stored locally in `~/.config/aletha-mcp/tokens/`
- Only read-only Drive access is requested
- No data is sent to external services beyond Google's API

#!/bin/bash

#============================================================================
# Bundle Aletha Knowledge Base MCP for Distribution
#
# Run this script to create the files you need to distribute to your team.
#
# Usage: ./bundle-for-distribution.sh
#============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$SCRIPT_DIR/dist"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${BLUE}${BOLD}Bundling Aletha Knowledge Base for Distribution${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

#============================================================================
# Check prerequisites
#============================================================================

echo -e "${BLUE}▶${NC} Checking prerequisites..."

# Check if project is built
if [[ ! -f "$PROJECT_DIR/dist/index.js" ]]; then
    echo -e "${YELLOW}⚠${NC} Project not built. Building now..."
    cd "$PROJECT_DIR"
    npm run build
fi

echo -e "${GREEN}✓${NC} Project is built"

#============================================================================
# Create output directory
#============================================================================

echo -e "${BLUE}▶${NC} Creating distribution package..."

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

#============================================================================
# Create server zip (without node_modules - installer will npm install)
#============================================================================

TEMP_DIR=$(mktemp -d)
SERVER_BUNDLE="$TEMP_DIR/aletha-knowledge-base-mcp"

mkdir -p "$SERVER_BUNDLE"

# Copy only what's needed
cp -r "$PROJECT_DIR/dist" "$SERVER_BUNDLE/"
cp "$PROJECT_DIR/package.json" "$SERVER_BUNDLE/"
cp "$PROJECT_DIR/package-lock.json" "$SERVER_BUNDLE/" 2>/dev/null || true

# Create the zip
cd "$TEMP_DIR"
zip -r "$OUTPUT_DIR/aletha-kb-server.zip" aletha-knowledge-base-mcp -q

rm -rf "$TEMP_DIR"

echo -e "${GREEN}✓${NC} Created aletha-kb-server.zip"

#============================================================================
# Create config template
#============================================================================

# Check if real config exists
REAL_CONFIG="$HOME/.config/aletha-mcp/config.json"

if [[ -f "$REAL_CONFIG" ]]; then
    cp "$REAL_CONFIG" "$OUTPUT_DIR/config.json"
    echo -e "${GREEN}✓${NC} Copied existing config from ~/.config/aletha-mcp/config.json"
else
    # Create template
    cat > "$OUTPUT_DIR/config.json" <<'CONFIGEOF'
{
  "knowledgeBase": {
    "rootFolderId": "YOUR_GOOGLE_DRIVE_FOLDER_ID",
    "rootFolderName": "Aletha Knowledge Base",
    "type": "folder"
  },
  "google": {
    "authType": "service_account",
    "serviceAccount": {
      "type": "service_account",
      "project_id": "YOUR_PROJECT_ID",
      "private_key_id": "YOUR_PRIVATE_KEY_ID",
      "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
      "client_email": "YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com",
      "client_id": "YOUR_CLIENT_ID",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token"
    }
  },
  "defaults": {
    "maxSearchResults": 10,
    "outputFormat": "markdown"
  }
}
CONFIGEOF
    echo -e "${YELLOW}⚠${NC} Created config.json TEMPLATE - you need to fill in your service account credentials"
fi

#============================================================================
# Copy installer
#============================================================================

cp "$SCRIPT_DIR/Install Aletha Knowledge Base.command" "$OUTPUT_DIR/"
chmod +x "$OUTPUT_DIR/Install Aletha Knowledge Base.command"

echo -e "${GREEN}✓${NC} Copied installer script"

#============================================================================
# Create README for distribution
#============================================================================

cat > "$OUTPUT_DIR/DISTRIBUTION-README.txt" <<'EOF'
ALETHA KNOWLEDGE BASE - DISTRIBUTION GUIDE
==========================================

This folder contains everything needed to distribute the Knowledge Base
integration to your team members.

FILES IN THIS FOLDER:
--------------------
1. aletha-kb-server.zip    - The MCP server code (upload this)
2. config.json             - Configuration with service account (upload this)
3. Install Aletha Knowledge Base.command - The installer (email this)

SETUP STEPS:
-----------

STEP 1: Upload the server zip
   - Upload "aletha-kb-server.zip" to Google Drive
   - Right-click → Get link → Change to "Anyone with the link"
   - Copy the link
   - Convert to direct download link:
     Original: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
     Direct:   https://drive.google.com/uc?export=download&id=FILE_ID

STEP 2: Configure config.json (if not already done)
   - Open config.json in a text editor
   - Fill in your service account credentials from Google Cloud Console
   - Fill in your Knowledge Base folder ID from Google Drive URL

STEP 3: Upload config.json
   - Upload "config.json" to Google Drive
   - Right-click → Get link → Change to "Anyone with the link"
   - Convert to direct download link (same as above)

STEP 4: Update the installer
   - Open "Install Aletha Knowledge Base.command" in a text editor
   - Find these lines near the top:
     SERVER_ZIP_URL="YOUR_SERVER_ZIP_URL_HERE"
     CONFIG_URL="YOUR_CONFIG_URL_HERE"
   - Replace with your direct download URLs from steps 1 and 3

STEP 5: Email the installer
   - Email "Install Aletha Knowledge Base.command" to your team
   - Tell them to:
     1. Download the file
     2. Double-click it
     3. If they get a security warning, go to System Settings →
        Privacy & Security → click "Open Anyway"
     4. Restart Claude Desktop when done


GETTING A SERVICE ACCOUNT:
-------------------------

1. Go to Google Cloud Console (console.cloud.google.com)
2. Create a project (or use existing)
3. Enable "Google Drive API"
4. Go to IAM & Admin → Service Accounts
5. Create Service Account
6. Create a key (JSON format) - this downloads automatically
7. Copy the contents into config.json under "serviceAccount"
8. Share your Knowledge Base folder with the service account email
   (the client_email address ending in .iam.gserviceaccount.com)


TROUBLESHOOTING:
---------------

"Permission denied" when double-clicking installer:
   → Right-click → Open (or use System Settings → Privacy & Security)

"Server not appearing in Claude":
   → Make sure Claude Desktop was fully quit and reopened
   → Check ~/Library/Application Support/Claude/claude_desktop_config.json

"Cannot access documents":
   → Make sure the Knowledge Base folder is shared with the service account email

EOF

echo -e "${GREEN}✓${NC} Created distribution README"

#============================================================================
# Summary
#============================================================================

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}                    Bundle Complete!                         ${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Output folder: ${BOLD}$OUTPUT_DIR${NC}"
echo ""
echo "Files created:"
echo "  • aletha-kb-server.zip              - Upload to Google Drive"
echo "  • config.json                       - Fill in credentials, then upload"
echo "  • Install Aletha Knowledge Base.command - Email to team"
echo "  • DISTRIBUTION-README.txt           - Setup instructions"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Read DISTRIBUTION-README.txt for detailed instructions"
echo "  2. Upload the zip and config to Google Drive"
echo "  3. Update the installer with the download URLs"
echo "  4. Email the installer to your team"
echo ""

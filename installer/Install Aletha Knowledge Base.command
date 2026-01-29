#!/bin/bash

#============================================================================
# Aletha Knowledge Base Installer for Claude Desktop
#
# Double-click this file to install. No technical knowledge required.
#============================================================================

set -e

# Configuration - UPDATE THESE URLs BEFORE DISTRIBUTING
SERVER_ZIP_URL="YOUR_SERVER_ZIP_URL_HERE"  # e.g., Google Drive direct download link
CONFIG_URL="YOUR_CONFIG_URL_HERE"          # e.g., Google Drive direct download link

# Styling
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Install location
INSTALL_DIR="$HOME/.aletha-mcp"
NODE_DIR="$INSTALL_DIR/node"
SERVER_DIR="$INSTALL_DIR/server"
CONFIG_FILE="$INSTALL_DIR/config.json"

# Claude Desktop config location
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

#============================================================================
# Helper Functions
#============================================================================

print_header() {
    clear
    echo ""
    echo -e "${BLUE}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}       Aletha Knowledge Base - Installer for Claude         ${NC}"
    echo -e "${BLUE}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

cleanup_on_error() {
    echo ""
    print_error "Installation failed. Please contact IT support."
    echo ""
    echo "Press any key to close..."
    read -n 1
    exit 1
}

trap cleanup_on_error ERR

#============================================================================
# Pre-flight Checks
#============================================================================

print_header

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    print_error "This installer is for macOS only."
    echo "Press any key to close..."
    read -n 1
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    NODE_ARCH="arm64"
    print_step "Detected Apple Silicon Mac (M1/M2/M3)"
elif [[ "$ARCH" == "x86_64" ]]; then
    NODE_ARCH="x64"
    print_step "Detected Intel Mac"
else
    print_error "Unsupported architecture: $ARCH"
    exit 1
fi

echo ""

#============================================================================
# Check for existing installation
#============================================================================

if [[ -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}An existing installation was found.${NC}"
    echo ""
    read -p "Do you want to reinstall? This will remove the existing installation. (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_step "Removing existing installation..."
        rm -rf "$INSTALL_DIR"
        print_success "Removed existing installation"
    else
        echo ""
        echo "Installation cancelled."
        echo "Press any key to close..."
        read -n 1
        exit 0
    fi
fi

echo ""

#============================================================================
# Create directories
#============================================================================

print_step "Creating installation directory..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$NODE_DIR"
mkdir -p "$SERVER_DIR"
print_success "Created $INSTALL_DIR"

#============================================================================
# Download and install Node.js
#============================================================================

NODE_VERSION="22.11.0"
NODE_FILENAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}.tar.gz"

print_step "Downloading Node.js v${NODE_VERSION}..."
echo "   (This may take a moment)"

cd "$INSTALL_DIR"
curl -L --progress-bar "$NODE_URL" -o node.tar.gz

print_step "Extracting Node.js..."
tar -xzf node.tar.gz
mv "${NODE_FILENAME}"/* "$NODE_DIR/"
rmdir "${NODE_FILENAME}"
rm node.tar.gz

print_success "Node.js installed to $NODE_DIR"

# Verify Node works
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"

if [[ ! -x "$NODE_BIN" ]]; then
    print_error "Node.js installation failed - binary not found"
    exit 1
fi

NODE_INSTALLED_VERSION=$("$NODE_BIN" --version)
print_success "Node.js $NODE_INSTALLED_VERSION is ready"

echo ""

#============================================================================
# Download MCP Server
#============================================================================

print_step "Downloading Aletha Knowledge Base server..."

if [[ "$SERVER_ZIP_URL" == "YOUR_SERVER_ZIP_URL_HERE" ]]; then
    print_error "Server download URL not configured."
    print_error "Please contact IT to get an updated installer."
    exit 1
fi

cd "$INSTALL_DIR"
curl -L --progress-bar "$SERVER_ZIP_URL" -o server.zip

print_step "Extracting server files..."
unzip -q server.zip -d server_temp

# Handle both flat and nested zip structures
if [[ -d "server_temp/aletha-knowledge-base-mcp" ]]; then
    mv server_temp/aletha-knowledge-base-mcp/* "$SERVER_DIR/"
elif [[ -d "server_temp/dist" ]]; then
    mv server_temp/* "$SERVER_DIR/"
else
    # Find the directory containing package.json
    PKG_DIR=$(find server_temp -name "package.json" -maxdepth 2 | head -1 | xargs dirname)
    if [[ -n "$PKG_DIR" ]]; then
        mv "$PKG_DIR"/* "$SERVER_DIR/"
    else
        mv server_temp/* "$SERVER_DIR/"
    fi
fi

rm -rf server_temp
rm server.zip

print_success "Server files extracted"

echo ""

#============================================================================
# Install npm dependencies
#============================================================================

print_step "Installing dependencies (this may take a few minutes)..."
cd "$SERVER_DIR"

# Set up PATH for npm to find node
export PATH="$NODE_DIR/bin:$PATH"

"$NPM_BIN" install --production --silent 2>/dev/null || "$NPM_BIN" install --production

print_success "Dependencies installed"

echo ""

#============================================================================
# Download configuration
#============================================================================

print_step "Downloading configuration..."

if [[ "$CONFIG_URL" == "YOUR_CONFIG_URL_HERE" ]]; then
    print_error "Configuration URL not configured."
    print_error "Please contact IT to get an updated installer."
    exit 1
fi

curl -L --progress-bar "$CONFIG_URL" -o "$CONFIG_FILE"

if [[ ! -f "$CONFIG_FILE" ]]; then
    print_error "Failed to download configuration"
    exit 1
fi

print_success "Configuration downloaded"

echo ""

#============================================================================
# Configure Claude Desktop
#============================================================================

print_step "Configuring Claude Desktop..."

# Create Claude config directory if it doesn't exist
mkdir -p "$CLAUDE_CONFIG_DIR"

# The MCP server configuration to add
MCP_CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "aletha-knowledge-base": {
      "command": "$NODE_BIN",
      "args": ["$SERVER_DIR/dist/index.js"],
      "env": {
        "ALETHA_MCP_CONFIG": "$CONFIG_FILE"
      }
    }
  }
}
EOF
)

if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
    # Config file exists - need to merge
    print_step "Merging with existing Claude configuration..."

    # Check if aletha-knowledge-base already configured
    if grep -q "aletha-knowledge-base" "$CLAUDE_CONFIG_FILE" 2>/dev/null; then
        print_warning "Aletha Knowledge Base is already in Claude config"
        print_step "Updating existing configuration..."
    fi

    # Create a backup
    cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.backup"

    # Use Node.js to merge JSON properly
    "$NODE_BIN" -e "
        const fs = require('fs');

        let existing = {};
        try {
            existing = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG_FILE', 'utf8'));
        } catch (e) {
            existing = {};
        }

        // Ensure mcpServers object exists
        if (!existing.mcpServers) {
            existing.mcpServers = {};
        }

        // Add/update our server config
        existing.mcpServers['aletha-knowledge-base'] = {
            command: '$NODE_BIN',
            args: ['$SERVER_DIR/dist/index.js'],
            env: {
                ALETHA_MCP_CONFIG: '$CONFIG_FILE'
            }
        };

        fs.writeFileSync('$CLAUDE_CONFIG_FILE', JSON.stringify(existing, null, 2));
    "

    print_success "Claude configuration updated (backup saved as claude_desktop_config.json.backup)"
else
    # No existing config - create new one
    echo "$MCP_CONFIG" > "$CLAUDE_CONFIG_FILE"
    print_success "Claude configuration created"
fi

echo ""

#============================================================================
# Verify Installation
#============================================================================

print_step "Verifying installation..."

# Check all required files exist
CHECKS_PASSED=true

if [[ ! -x "$NODE_BIN" ]]; then
    print_error "Node.js binary not found"
    CHECKS_PASSED=false
fi

if [[ ! -f "$SERVER_DIR/dist/index.js" ]]; then
    print_error "Server entry point not found"
    CHECKS_PASSED=false
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    print_error "Configuration file not found"
    CHECKS_PASSED=false
fi

if [[ ! -f "$CLAUDE_CONFIG_FILE" ]]; then
    print_error "Claude Desktop configuration not found"
    CHECKS_PASSED=false
fi

if [[ "$CHECKS_PASSED" != true ]]; then
    print_error "Installation verification failed"
    exit 1
fi

print_success "All components verified"

echo ""

#============================================================================
# Done!
#============================================================================

echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}                 Installation Complete!                      ${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. ${BOLD}Quit Claude Desktop${NC} if it's running"
echo "     (Click Claude in menu bar → Quit Claude)"
echo ""
echo "  2. ${BOLD}Reopen Claude Desktop${NC}"
echo ""
echo "  3. ${BOLD}Start using it!${NC} Try asking Claude:"
echo "     \"Search the knowledge base for onboarding documents\""
echo ""
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo ""
echo "Installation location: $INSTALL_DIR"
echo ""
echo "If you have any issues, contact IT support."
echo ""
echo -e "${GREEN}Press any key to close this window...${NC}"
read -n 1

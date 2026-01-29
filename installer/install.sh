#!/bin/bash

#============================================================================
# Aletha Knowledge Base - One-Line Installer for Claude Desktop
#
# Usage: curl -fsSL https://raw.githubusercontent.com/alethainc/aletha-knowledge-base-mcp/main/installer/install.sh | bash
#============================================================================

set -e

# Configuration - these URLs point to the server bundle and config on Google Drive
SERVER_ZIP_URL="https://drive.google.com/uc?export=download&id=1V07s46KV2iytevyK7W_JPXq67wZ2TBPJ"
CONFIG_URL="https://drive.google.com/uc?export=download&id=1QzBku6dgGNwLwfGxKLmDGIHrewIyGbdn"

# Styling
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'
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

fail() {
    print_error "$1"
    echo ""
    echo "Installation failed. Please contact IT support or try again."
    exit 1
}

#============================================================================
# Start Installation
#============================================================================

echo ""
echo -e "${BLUE}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}       Aletha Knowledge Base - Installer for Claude         ${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    fail "This installer is for macOS only."
fi

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    NODE_ARCH="arm64"
    print_step "Detected Apple Silicon Mac (M1/M2/M3/M4)"
elif [[ "$ARCH" == "x86_64" ]]; then
    NODE_ARCH="x64"
    print_step "Detected Intel Mac"
else
    fail "Unsupported architecture: $ARCH"
fi

echo ""

#============================================================================
# Handle Existing Installation
#============================================================================

if [[ -d "$INSTALL_DIR" ]]; then
    print_warning "Existing installation found - removing it..."
    rm -rf "$INSTALL_DIR"
    print_success "Removed old installation"
    echo ""
fi

#============================================================================
# Create Directories
#============================================================================

print_step "Creating installation directory..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$NODE_DIR"
mkdir -p "$SERVER_DIR"
print_success "Created $INSTALL_DIR"

#============================================================================
# Download and Install Node.js
#============================================================================

NODE_VERSION="22.11.0"
NODE_FILENAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}.tar.gz"

print_step "Downloading Node.js v${NODE_VERSION}..."

cd "$INSTALL_DIR"
if ! curl -fSL "$NODE_URL" -o node.tar.gz 2>/dev/null; then
    fail "Failed to download Node.js"
fi

print_step "Extracting Node.js..."
tar -xzf node.tar.gz
mv "${NODE_FILENAME}"/* "$NODE_DIR/"
rmdir "${NODE_FILENAME}"
rm node.tar.gz

# Verify Node works
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"

if [[ ! -x "$NODE_BIN" ]]; then
    fail "Node.js installation failed - binary not found"
fi

NODE_INSTALLED_VERSION=$("$NODE_BIN" --version)
print_success "Node.js $NODE_INSTALLED_VERSION installed"

echo ""

#============================================================================
# Download MCP Server
#============================================================================

print_step "Downloading Aletha Knowledge Base server..."

cd "$INSTALL_DIR"

# Google Drive may require confirmation for large files - handle both cases
if ! curl -fSL "$SERVER_ZIP_URL" -o server.zip 2>/dev/null; then
    fail "Failed to download server files"
fi

# Check if we got an HTML page (Google Drive confirmation) instead of a zip
if file server.zip | grep -q "HTML"; then
    # Extract confirmation token and retry
    CONFIRM=$(grep -o 'confirm=[^&]*' server.zip | head -1 | cut -d= -f2)
    if [[ -n "$CONFIRM" ]]; then
        print_step "Handling large file confirmation..."
        curl -fSL "${SERVER_ZIP_URL}&confirm=${CONFIRM}" -o server.zip 2>/dev/null || fail "Failed to download server files"
    fi
fi

print_step "Extracting server files..."
unzip -q server.zip -d server_temp || fail "Failed to extract server files"

# Handle both flat and nested zip structures
if [[ -d "server_temp/aletha-knowledge-base-mcp" ]]; then
    mv server_temp/aletha-knowledge-base-mcp/* "$SERVER_DIR/"
elif [[ -d "server_temp/dist" ]]; then
    mv server_temp/* "$SERVER_DIR/"
else
    PKG_DIR=$(find server_temp -name "package.json" -maxdepth 2 | head -1 | xargs dirname 2>/dev/null)
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
# Install npm Dependencies
#============================================================================

print_step "Installing dependencies (this may take a minute)..."
cd "$SERVER_DIR"

export PATH="$NODE_DIR/bin:$PATH"

if ! "$NPM_BIN" install --production --silent 2>/dev/null; then
    # Retry without silent flag to see errors
    "$NPM_BIN" install --production || fail "Failed to install dependencies"
fi

print_success "Dependencies installed"

echo ""

#============================================================================
# Download Configuration
#============================================================================

print_step "Downloading configuration..."

if ! curl -fSL "$CONFIG_URL" -o "$CONFIG_FILE" 2>/dev/null; then
    fail "Failed to download configuration"
fi

if [[ ! -s "$CONFIG_FILE" ]]; then
    fail "Configuration file is empty"
fi

print_success "Configuration downloaded"

echo ""

#============================================================================
# Configure Claude Desktop
#============================================================================

print_step "Configuring Claude Desktop..."

mkdir -p "$CLAUDE_CONFIG_DIR"

if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
    # Config file exists - merge using Node.js
    if grep -q "aletha-knowledge-base" "$CLAUDE_CONFIG_FILE" 2>/dev/null; then
        print_warning "Updating existing Aletha configuration..."
    fi

    cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.backup"

    "$NODE_BIN" -e "
        const fs = require('fs');
        let existing = {};
        try {
            existing = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG_FILE', 'utf8'));
        } catch (e) {
            existing = {};
        }
        if (!existing.mcpServers) {
            existing.mcpServers = {};
        }
        existing.mcpServers['aletha-knowledge-base'] = {
            command: '$NODE_BIN',
            args: ['$SERVER_DIR/dist/index.js'],
            env: {
                ALETHA_MCP_CONFIG: '$CONFIG_FILE'
            }
        };
        fs.writeFileSync('$CLAUDE_CONFIG_FILE', JSON.stringify(existing, null, 2));
    " || fail "Failed to update Claude configuration"

    print_success "Claude configuration updated"
else
    # Create new config
    cat > "$CLAUDE_CONFIG_FILE" <<EOF
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
    print_success "Claude configuration created"
fi

echo ""

#============================================================================
# Verify Installation
#============================================================================

print_step "Verifying installation..."

CHECKS_PASSED=true

[[ ! -x "$NODE_BIN" ]] && print_error "Node.js binary not found" && CHECKS_PASSED=false
[[ ! -f "$SERVER_DIR/dist/index.js" ]] && print_error "Server entry point not found" && CHECKS_PASSED=false
[[ ! -f "$CONFIG_FILE" ]] && print_error "Configuration file not found" && CHECKS_PASSED=false
[[ ! -f "$CLAUDE_CONFIG_FILE" ]] && print_error "Claude config not found" && CHECKS_PASSED=false

if [[ "$CHECKS_PASSED" != true ]]; then
    fail "Installation verification failed"
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
echo "  1. ${BOLD}Quit Claude Desktop${NC} completely"
echo "     (Click Claude in menu bar → Quit Claude)"
echo ""
echo "  2. ${BOLD}Reopen Claude Desktop${NC}"
echo ""
echo "  3. ${BOLD}Start using it!${NC} Try asking Claude:"
echo "     \"Search the knowledge base for onboarding documents\""
echo ""
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo "Installation location: $INSTALL_DIR"
echo ""
echo "If you have any issues, contact IT support."
echo ""

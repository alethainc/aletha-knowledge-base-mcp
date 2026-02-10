#============================================================================
# Aletha Knowledge Base - One-Line Installer for Claude Desktop (Windows)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/alethainc/aletha-knowledge-base-mcp/main/installer/install.ps1 | iex"
#============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speed up Invoke-WebRequest

# Ensure TLS 1.2 for HTTPS downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Runtime checks (#Requires is ignored when piped through irm | iex)
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "[X]  PowerShell 5.1 or later is required. You have $($PSVersionTable.PSVersion)." -ForegroundColor Red
    exit 1
}
if ($env:OS -ne "Windows_NT") {
    Write-Host "[X]  This installer is for Windows only. Use install.sh for macOS." -ForegroundColor Red
    exit 1
}

# Configuration
# Server code is pulled directly from GitHub (public repo)
# Config with credentials is stored on Google Drive (private)
$GITHUB_REPO = "alethainc/aletha-knowledge-base-mcp"
$GITHUB_BRANCH = "main"
$CONFIG_URL = "https://drive.google.com/uc?export=download&id=1QzBku6dgGNwLwfGxKLmDGIHrewIyGbdn"

# Install location
$INSTALL_DIR = Join-Path $env:USERPROFILE ".aletha-mcp"
$NODE_DIR = Join-Path $INSTALL_DIR "node"
$SERVER_DIR = Join-Path $INSTALL_DIR "server"
$CONFIG_FILE = Join-Path $INSTALL_DIR "config.json"

# Claude Desktop config location (Windows)
$CLAUDE_CONFIG_DIR = Join-Path $env:APPDATA "Claude"
$CLAUDE_CONFIG_FILE = Join-Path $CLAUDE_CONFIG_DIR "claude_desktop_config.json"

#============================================================================
# Helper Functions
#============================================================================

function Print-Step($msg) {
    Write-Host ">> " -ForegroundColor Blue -NoNewline
    Write-Host $msg
}

function Print-Success($msg) {
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Print-Error($msg) {
    Write-Host "[X]  " -ForegroundColor Red -NoNewline
    Write-Host $msg
}

function Print-Warning($msg) {
    Write-Host "[!]  " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}

function Fail($msg) {
    Print-Error $msg
    Write-Host ""
    Write-Host "Installation failed. Please contact IT support or try again."
    exit 1
}

#============================================================================
# Start Installation
#============================================================================

Write-Host ""
Write-Host "================================================================" -ForegroundColor Blue
Write-Host "     Aletha Knowledge Base - Installer for Claude (Windows)     " -ForegroundColor Blue
Write-Host "================================================================" -ForegroundColor Blue
Write-Host ""

# Detect architecture
$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
    "AMD64" {
        $NODE_ARCH = "x64"
        Print-Step "Detected 64-bit Windows (x64)"
    }
    "ARM64" {
        $NODE_ARCH = "arm64"
        Print-Step "Detected ARM64 Windows"
    }
    default {
        Fail "Unsupported architecture: $arch"
    }
}

Write-Host ""

#============================================================================
# Handle Existing Installation
#============================================================================

if (Test-Path $INSTALL_DIR) {
    Print-Warning "Existing installation found - removing it..."
    Remove-Item -Recurse -Force $INSTALL_DIR
    Print-Success "Removed old installation"
    Write-Host ""
}

#============================================================================
# Create Directories
#============================================================================

Print-Step "Creating installation directory..."
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $NODE_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $SERVER_DIR -Force | Out-Null
Print-Success "Created $INSTALL_DIR"

#============================================================================
# Download and Install Node.js
#============================================================================

$NODE_VERSION = "22.11.0"
$NODE_FILENAME = "node-v$NODE_VERSION-win-$NODE_ARCH"
$NODE_URL = "https://nodejs.org/dist/v$NODE_VERSION/$NODE_FILENAME.zip"
$NODE_ZIP = Join-Path $INSTALL_DIR "node.zip"

Print-Step "Downloading Node.js v$NODE_VERSION..."

try {
    Invoke-WebRequest -Uri $NODE_URL -OutFile $NODE_ZIP -UseBasicParsing
} catch {
    Fail "Failed to download Node.js: $_"
}

Print-Step "Extracting Node.js..."
$NODE_EXTRACT = Join-Path $INSTALL_DIR "node-extract"
Expand-Archive -Path $NODE_ZIP -DestinationPath $NODE_EXTRACT -Force

# Move contents from extracted folder to node directory
$extractedNodeDir = Join-Path $NODE_EXTRACT $NODE_FILENAME
if (Test-Path $extractedNodeDir) {
    Get-ChildItem -Path $extractedNodeDir -Force | Move-Item -Destination $NODE_DIR -Force
    Remove-Item -Path $NODE_EXTRACT -Recurse -Force
} else {
    Fail "Unexpected Node.js archive structure"
}
Remove-Item -Path $NODE_ZIP -Force

# Verify Node works
$NODE_BIN = Join-Path $NODE_DIR "node.exe"
$NPM_CMD = Join-Path $NODE_DIR "npm.cmd"

if (-not (Test-Path $NODE_BIN)) {
    Fail "Node.js installation failed - binary not found"
}

$nodeInstalledVersion = & $NODE_BIN --version
Print-Success "Node.js $nodeInstalledVersion installed"

Write-Host ""

#============================================================================
# Download MCP Server from GitHub
#============================================================================

Print-Step "Downloading Aletha Knowledge Base server from GitHub..."

$GITHUB_ZIP_URL = "https://github.com/$GITHUB_REPO/archive/refs/heads/$GITHUB_BRANCH.zip"
$REPO_ZIP = Join-Path $INSTALL_DIR "repo.zip"

try {
    Invoke-WebRequest -Uri $GITHUB_ZIP_URL -OutFile $REPO_ZIP -UseBasicParsing
} catch {
    Fail "Failed to download server from GitHub. Is the repo public?"
}

Print-Step "Extracting server files..."
$REPO_EXTRACT = Join-Path $INSTALL_DIR "repo-extract"
Expand-Archive -Path $REPO_ZIP -DestinationPath $REPO_EXTRACT -Force

# GitHub zips extract to {repo-name}-{branch}/
$EXTRACTED_DIR = Join-Path $REPO_EXTRACT "aletha-knowledge-base-mcp-$GITHUB_BRANCH"

if (-not (Test-Path $EXTRACTED_DIR)) {
    Fail "Unexpected archive structure - expected aletha-knowledge-base-mcp-$GITHUB_BRANCH"
}

# Move contents to server directory
Get-ChildItem -Path $EXTRACTED_DIR -Force | Move-Item -Destination $SERVER_DIR -Force
Remove-Item -Path $REPO_EXTRACT -Recurse -Force
Remove-Item -Path $REPO_ZIP -Force

Print-Success "Server files extracted"

Write-Host ""

#============================================================================
# Build the Server
#============================================================================

Print-Step "Installing dependencies and building..."

# Add node to PATH for this session
$env:PATH = "$NODE_DIR;$env:PATH"

Push-Location $SERVER_DIR
try {
    # Install all dependencies (including devDependencies for build)
    Print-Step "Running npm install (this may take a few minutes)..."
    & $NPM_CMD install
    if ($LASTEXITCODE -ne 0) { Fail "Failed to install dependencies" }

    # Build TypeScript
    Print-Step "Compiling TypeScript..."
    & $NPM_CMD run build
    if ($LASTEXITCODE -ne 0) { Fail "Failed to build server" }

    # Clean up devDependencies to save space
    Print-Step "Cleaning up..."
    & $NPM_CMD prune --omit=dev 2>$null
} finally {
    Pop-Location
}

Print-Success "Server built successfully"

Write-Host ""

#============================================================================
# Download Configuration
#============================================================================

Print-Step "Downloading configuration..."

try {
    Invoke-WebRequest -Uri $CONFIG_URL -OutFile $CONFIG_FILE -UseBasicParsing
} catch {
    Fail "Failed to download configuration"
}

if (-not (Test-Path $CONFIG_FILE) -or (Get-Item $CONFIG_FILE).Length -eq 0) {
    Fail "Configuration file is empty or missing"
}

Print-Success "Configuration downloaded"

Write-Host ""

#============================================================================
# Configure Claude Desktop
#============================================================================

Print-Step "Configuring Claude Desktop..."

New-Item -ItemType Directory -Path $CLAUDE_CONFIG_DIR -Force | Out-Null

# Write a temporary JS script for config merging to avoid path-escaping issues.
# The script uses path.join() and env vars so paths are always correct.
$mergeScriptPath = Join-Path $INSTALL_DIR "_merge-config.js"

$mergeJs = @'
const fs = require('fs');
const path = require('path');

const installDir = path.join(process.env.USERPROFILE, '.aletha-mcp');
const configFilePath = path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
const nodeBin = path.join(installDir, 'node', 'node.exe');
const serverEntry = path.join(installDir, 'server', 'dist', 'index.js');
const mcpConfigFile = path.join(installDir, 'config.json');

let existing = {};
try {
    existing = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
} catch (e) {
    // File doesn't exist or is invalid - start fresh
    existing = {};
}

if (!existing.mcpServers) {
    existing.mcpServers = {};
}

existing.mcpServers['aletha-knowledge-base'] = {
    command: nodeBin,
    args: [serverEntry],
    env: {
        ALETHA_MCP_CONFIG: mcpConfigFile
    }
};

fs.writeFileSync(configFilePath, JSON.stringify(existing, null, 2));
'@

$mergeJs | Set-Content -Path $mergeScriptPath -Encoding UTF8

if (Test-Path $CLAUDE_CONFIG_FILE) {
    # Backup existing config
    if ((Get-Content $CLAUDE_CONFIG_FILE -Raw) -match "aletha-knowledge-base") {
        Print-Warning "Updating existing Aletha configuration..."
    }
    Copy-Item $CLAUDE_CONFIG_FILE "$CLAUDE_CONFIG_FILE.backup"
}

& $NODE_BIN $mergeScriptPath
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Path $mergeScriptPath -Force -ErrorAction SilentlyContinue
    Fail "Failed to configure Claude Desktop"
}

Remove-Item -Path $mergeScriptPath -Force -ErrorAction SilentlyContinue

if (Test-Path "$CLAUDE_CONFIG_FILE.backup") {
    Print-Success "Claude configuration updated (backup saved)"
} else {
    Print-Success "Claude configuration created"
}

Write-Host ""

#============================================================================
# Verify Installation
#============================================================================

Print-Step "Verifying installation..."

$checksPassed = $true

if (-not (Test-Path $NODE_BIN)) {
    Print-Error "Node.js binary not found"
    $checksPassed = $false
}

$serverEntry = Join-Path $SERVER_DIR "dist\index.js"
if (-not (Test-Path $serverEntry)) {
    Print-Error "Server entry point not found"
    $checksPassed = $false
}

if (-not (Test-Path $CONFIG_FILE)) {
    Print-Error "Configuration file not found"
    $checksPassed = $false
}

if (-not (Test-Path $CLAUDE_CONFIG_FILE)) {
    Print-Error "Claude config not found"
    $checksPassed = $false
}

if (-not $checksPassed) {
    Fail "Installation verification failed"
}

Print-Success "All components verified"

Write-Host ""

#============================================================================
# Done!
#============================================================================

Write-Host "================================================================" -ForegroundColor Green
Write-Host "                 Installation Complete!                          " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host ""
Write-Host "  1. " -NoNewline
Write-Host "Quit Claude Desktop" -NoNewline -ForegroundColor White
Write-Host " completely"
Write-Host "     (Right-click Claude in system tray -> Quit)"
Write-Host ""
Write-Host "  2. " -NoNewline
Write-Host "Reopen Claude Desktop" -ForegroundColor White
Write-Host ""
Write-Host "  3. " -NoNewline
Write-Host "Start using it! " -NoNewline -ForegroundColor White
Write-Host "Try asking Claude:"
Write-Host '     "Search the knowledge base for onboarding documents"'
Write-Host ""
Write-Host "----------------------------------------------------------------" -ForegroundColor Blue
Write-Host "Installation location: $INSTALL_DIR"
Write-Host ""
Write-Host "If you have any issues, contact IT support."
Write-Host ""

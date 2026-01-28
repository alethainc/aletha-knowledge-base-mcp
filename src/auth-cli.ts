#!/usr/bin/env node

/**
 * CLI tool for authenticating with Google Drive.
 * Run with: npm run auth
 */

import { loadConfig, getConfigDir, getConfigPath } from "./config/loader.js";
import { authenticateInteractive, loadStoredTokens } from "./google/auth.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  console.log("====================================================");
  console.log("  Aletha Knowledge Base MCP - Authentication Setup  ");
  console.log("====================================================\n");

  // Check if config exists
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  if (!existsSync(configPath)) {
    console.log("Configuration file not found.\n");
    console.log(`Expected location: ${configPath}\n`);
    console.log("Creating a template configuration file...\n");

    // Create config directory if needed
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Create template config
    const templateConfig = {
      knowledgeBase: {
        rootFolderId: "YOUR_GOOGLE_DRIVE_FOLDER_ID",
        rootFolderName: "Aletha Knowledge Base",
        type: "folder",
      },
      google: {
        clientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",
        clientSecret: "YOUR_CLIENT_SECRET",
        redirectUri: "http://localhost:3000/oauth/callback",
      },
      defaults: {
        maxSearchResults: 10,
        outputFormat: "markdown",
      },
    };

    writeFileSync(configPath, JSON.stringify(templateConfig, null, 2));
    console.log(`Template created at: ${configPath}\n`);
    console.log("Please update the configuration with your Google Cloud credentials:");
    console.log("1. Go to https://console.cloud.google.com/");
    console.log("2. Create a new project or select an existing one");
    console.log("3. Enable the Google Drive API");
    console.log("4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID");
    console.log("5. Choose 'Desktop app' as the application type");
    console.log("6. Copy the Client ID and Client Secret to the config file");
    console.log("7. Get the folder ID from your Google Drive URL");
    console.log("   (The ID is the long string after /folders/ in the URL)\n");
    console.log("After updating the config, run this command again.\n");
    process.exit(1);
  }

  // Load config
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error("Error loading configuration:", error);
    console.log(`\nPlease check your configuration file at: ${configPath}`);
    process.exit(1);
  }

  // Check for existing tokens
  const existingTokens = loadStoredTokens();
  if (existingTokens) {
    console.log("Existing authentication found.");
    if (existingTokens.expiry_date) {
      const expiry = new Date(existingTokens.expiry_date);
      if (expiry > new Date()) {
        console.log(`Token valid until: ${expiry.toLocaleString()}`);
        console.log("\nYou are already authenticated!");
        console.log("Run with --force to re-authenticate.\n");

        if (!process.argv.includes("--force")) {
          process.exit(0);
        }
        console.log("--force flag detected, re-authenticating...\n");
      } else {
        console.log("Token has expired, re-authenticating...\n");
      }
    }
  }

  // Start interactive authentication
  console.log("Starting Google OAuth authentication...\n");
  console.log(`Knowledge Base: ${config.knowledgeBase.rootFolderName}`);
  console.log(`Folder ID: ${config.knowledgeBase.rootFolderId}\n`);

  try {
    await authenticateInteractive(config);
    console.log("\n====================================================");
    console.log("  Authentication successful!                        ");
    console.log("====================================================\n");
    console.log("You can now use the MCP server with Claude Code.\n");
    console.log("Add this to your Claude Code MCP configuration:\n");
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            "aletha-knowledge-base": {
              command: "node",
              args: [join(process.cwd(), "dist", "index.js")],
            },
          },
        },
        null,
        2
      )
    );
    console.log("");
  } catch (error) {
    console.error("\nAuthentication failed:", error);
    process.exit(1);
  }
}

main();

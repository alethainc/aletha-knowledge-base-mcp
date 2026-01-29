#!/usr/bin/env node

/**
 * CLI tool for authenticating with Google Drive.
 * Run with: npm run auth
 */

import {
  loadConfig,
  getConfigDir,
  getConfigPath,
  loadServiceAccountCredentials,
} from "./config/loader.js";
import {
  authenticateInteractive,
  loadStoredTokens,
  createServiceAccountClient,
} from "./google/auth.js";
import { createDriveClient } from "./google/drive.js";
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

    // Create template config with service account as default (simpler for teams)
    const templateConfig = {
      knowledgeBase: {
        rootFolderId: "YOUR_GOOGLE_DRIVE_FOLDER_ID",
        rootFolderName: "Aletha Knowledge Base",
        type: "folder",
      },
      google: {
        authType: "service_account",
        serviceAccountKeyFile: "/path/to/service-account-key.json",
      },
      defaults: {
        maxSearchResults: 10,
        outputFormat: "markdown",
      },
    };

    writeFileSync(configPath, JSON.stringify(templateConfig, null, 2));
    console.log(`Template created at: ${configPath}\n`);
    console.log("Please update the configuration with your Google Cloud credentials:\n");
    console.log("=== SERVICE ACCOUNT (Recommended for Teams) ===");
    console.log("1. Go to https://console.cloud.google.com/");
    console.log("2. Create a new project or select an existing one");
    console.log("3. Enable the Google Drive API");
    console.log("4. Go to IAM & Admin > Service Accounts");
    console.log("5. Create a service account and download the JSON key");
    console.log("6. Share your Google Drive folder with the service account email");
    console.log("7. Set serviceAccountKeyFile path in the config\n");
    console.log("=== OAUTH (Alternative for Personal Use) ===");
    console.log("Change authType to 'oauth' and add:");
    console.log("  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com'");
    console.log("  clientSecret: 'YOUR_CLIENT_SECRET'");
    console.log("  redirectUri: 'http://localhost:3000/oauth/callback'\n");
    console.log("Get the folder ID from your Google Drive URL");
    console.log("(The ID is the long string after /folders/ in the URL)\n");
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

  const authType = config.google.authType || "oauth";
  console.log(`Authentication type: ${authType}\n`);
  console.log(`Knowledge Base: ${config.knowledgeBase.rootFolderName}`);
  console.log(`Folder ID: ${config.knowledgeBase.rootFolderId}\n`);

  if (authType === "service_account") {
    // Service account flow - validate credentials and test connection
    console.log("Validating service account credentials...\n");

    try {
      const credentials = loadServiceAccountCredentials(config);
      console.log(`Service account: ${credentials.client_email}`);
      if (credentials.project_id) {
        console.log(`Project ID: ${credentials.project_id}`);
      }

      // Test the connection by authorizing and listing root folder
      console.log("\nTesting connection to Google Drive...");
      const jwtClient = createServiceAccountClient(config);
      await jwtClient.authorize();

      const drive = createDriveClient(jwtClient);
      const folderResponse = await drive.files.get({
        fileId: config.knowledgeBase.rootFolderId,
        fields: "id, name",
        supportsAllDrives: true,
      });

      console.log(
        `Successfully accessed folder: ${folderResponse.data.name}\n`
      );

      console.log("====================================================");
      console.log("  Service Account Authentication Successful!        ");
      console.log("====================================================\n");
      console.log("No browser authentication required!\n");
      console.log("IMPORTANT: Make sure the Google Drive folder is shared with:");
      console.log(`  ${credentials.client_email}\n`);
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
      console.error("\nService account validation failed:", error);
      console.log("\nTroubleshooting:");
      console.log("1. Verify the service account key file exists and is valid JSON");
      console.log("2. Ensure the Google Drive folder is shared with the service account email");
      console.log("3. Check that the Google Drive API is enabled in your project");
      process.exit(1);
    }
  } else {
    // OAuth flow - existing logic
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
}

main();

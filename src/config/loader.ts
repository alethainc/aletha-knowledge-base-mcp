import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface KnowledgeBaseConfig {
  rootFolderId: string;
  rootFolderName: string;
  type: "shared_drive" | "folder";
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Config {
  knowledgeBase: KnowledgeBaseConfig;
  google: GoogleConfig;
  defaults: {
    maxSearchResults: number;
    outputFormat: "text" | "markdown" | "html";
  };
}

export interface CoreDoc {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface CoreDocsConfig {
  coreDocs: CoreDoc[];
}

const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "aletha-mcp");

export function getConfigDir(): string {
  return process.env.ALETHA_MCP_CONFIG_DIR || DEFAULT_CONFIG_DIR;
}

export function getConfigPath(): string {
  const envPath = process.env.ALETHA_MCP_CONFIG;
  if (envPath) return envPath;
  return join(getConfigDir(), "config.json");
}

export function getCoreDocsPath(): string {
  return join(getConfigDir(), "core-docs.json");
}

export function getTokensDir(): string {
  return join(getConfigDir(), "tokens");
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at ${configPath}. ` +
        `Please create it or set ALETHA_MCP_CONFIG environment variable.`
    );
  }

  const configData = readFileSync(configPath, "utf-8");
  const config = JSON.parse(configData) as Config;

  // Validate required fields
  if (!config.knowledgeBase?.rootFolderId) {
    throw new Error("config.knowledgeBase.rootFolderId is required");
  }
  if (!config.google?.clientId || !config.google?.clientSecret) {
    throw new Error("config.google.clientId and clientSecret are required");
  }

  // Apply defaults
  config.defaults = {
    maxSearchResults: config.defaults?.maxSearchResults || 10,
    outputFormat: config.defaults?.outputFormat || "markdown",
  };

  config.google.redirectUri =
    config.google.redirectUri || "http://localhost:3000/oauth/callback";

  return config;
}

export function loadCoreDocs(): CoreDocsConfig {
  const coreDocsPath = getCoreDocsPath();

  if (!existsSync(coreDocsPath)) {
    return { coreDocs: [] };
  }

  const data = readFileSync(coreDocsPath, "utf-8");
  return JSON.parse(data) as CoreDocsConfig;
}

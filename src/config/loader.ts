import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface KnowledgeBaseConfig {
  rootFolderId: string;
  rootFolderName: string;
  type: "shared_drive" | "folder";
}

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface GoogleConfig {
  authType?: "oauth" | "service_account"; // defaults to "oauth"

  // OAuth fields
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;

  // Service account fields
  serviceAccount?: ServiceAccountCredentials;
  serviceAccountKeyFile?: string;
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

export function loadServiceAccountCredentials(
  config: Config
): ServiceAccountCredentials {
  // Priority 1: ALETHA_SERVICE_ACCOUNT_KEY env var (raw JSON or base64)
  const alethaKey = process.env.ALETHA_SERVICE_ACCOUNT_KEY;
  if (alethaKey) {
    try {
      // Try parsing as raw JSON first
      const credentials = JSON.parse(alethaKey) as ServiceAccountCredentials;
      if (credentials.client_email && credentials.private_key) {
        return credentials;
      }
    } catch {
      // Try base64 decoding
      try {
        const decoded = Buffer.from(alethaKey, "base64").toString("utf-8");
        const credentials = JSON.parse(decoded) as ServiceAccountCredentials;
        if (credentials.client_email && credentials.private_key) {
          return credentials;
        }
      } catch {
        throw new Error(
          "ALETHA_SERVICE_ACCOUNT_KEY is not valid JSON or base64-encoded JSON"
        );
      }
    }
  }

  // Priority 2: Embedded serviceAccount in config
  if (config.google?.serviceAccount) {
    const { client_email, private_key } = config.google.serviceAccount;
    if (client_email && private_key) {
      return config.google.serviceAccount;
    }
  }

  // Priority 3: serviceAccountKeyFile path
  if (config.google?.serviceAccountKeyFile) {
    const keyPath = config.google.serviceAccountKeyFile;
    if (existsSync(keyPath)) {
      const keyData = readFileSync(keyPath, "utf-8");
      const credentials = JSON.parse(keyData) as ServiceAccountCredentials;
      if (credentials.client_email && credentials.private_key) {
        return credentials;
      }
    }
    throw new Error(
      `Service account key file not found or invalid: ${keyPath}`
    );
  }

  // Priority 4: GOOGLE_SERVICE_ACCOUNT_KEY env var (base64 encoded)
  const base64Key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (base64Key) {
    try {
      const decoded = Buffer.from(base64Key, "base64").toString("utf-8");
      const credentials = JSON.parse(decoded) as ServiceAccountCredentials;
      if (credentials.client_email && credentials.private_key) {
        return credentials;
      }
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY is not valid base64-encoded JSON"
      );
    }
  }

  // Priority 5: GOOGLE_APPLICATION_CREDENTIALS env var (path)
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    if (existsSync(credPath)) {
      const keyData = readFileSync(credPath, "utf-8");
      const credentials = JSON.parse(keyData) as ServiceAccountCredentials;
      if (credentials.client_email && credentials.private_key) {
        return credentials;
      }
    }
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS file not found or invalid: ${credPath}`
    );
  }

  throw new Error(
    "No service account credentials found. Provide one of: " +
      "ALETHA_SERVICE_ACCOUNT_KEY env var, google.serviceAccount in config, " +
      "google.serviceAccountKeyFile path, GOOGLE_SERVICE_ACCOUNT_KEY (base64), " +
      "or GOOGLE_APPLICATION_CREDENTIALS (path)"
  );
}

function loadConfigFromEnv(): Config | null {
  // Check if we have the minimum required env vars for full env-based config
  const rootFolderId = process.env.ALETHA_ROOT_FOLDER_ID;
  const authType = process.env.ALETHA_AUTH_TYPE as "oauth" | "service_account" | undefined;

  if (!rootFolderId) {
    return null; // Fall back to file-based config
  }

  return {
    knowledgeBase: {
      rootFolderId,
      rootFolderName: process.env.ALETHA_ROOT_FOLDER_NAME || "Knowledge Base",
      type: (process.env.ALETHA_FOLDER_TYPE as "shared_drive" | "folder") || "folder",
    },
    google: {
      authType: authType || "service_account",
      // OAuth fields from env (if needed)
      clientId: process.env.ALETHA_CLIENT_ID,
      clientSecret: process.env.ALETHA_CLIENT_SECRET,
      redirectUri: process.env.ALETHA_REDIRECT_URI,
      // Service account fields loaded separately via loadServiceAccountCredentials
    },
    defaults: {
      maxSearchResults: parseInt(process.env.ALETHA_MAX_RESULTS || "10", 10),
      outputFormat: (process.env.ALETHA_OUTPUT_FORMAT as "text" | "markdown" | "html") || "markdown",
    },
  };
}

export function loadConfig(): Config {
  // Try loading from environment variables first
  const envConfig = loadConfigFromEnv();
  if (envConfig) {
    // Validate and return env-based config
    const authType = envConfig.google.authType || "service_account";

    if (authType === "oauth") {
      if (!envConfig.google.clientId || !envConfig.google.clientSecret) {
        throw new Error(
          "ALETHA_CLIENT_ID and ALETHA_CLIENT_SECRET are required for OAuth authentication"
        );
      }
      envConfig.google.redirectUri =
        envConfig.google.redirectUri || "http://localhost:3000/oauth/callback";
    } else if (authType === "service_account") {
      // Validate service account credentials are available
      loadServiceAccountCredentials(envConfig);
    }

    return envConfig;
  }

  // Fall back to file-based config
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at ${configPath}. ` +
        `Either create the file, set ALETHA_MCP_CONFIG env var, ` +
        `or provide ALETHA_ROOT_FOLDER_ID and ALETHA_SERVICE_ACCOUNT_KEY env vars.`
    );
  }

  const configData = readFileSync(configPath, "utf-8");
  const config = JSON.parse(configData) as Config;

  // Validate required fields
  if (!config.knowledgeBase?.rootFolderId) {
    throw new Error("config.knowledgeBase.rootFolderId is required");
  }

  // Determine auth type (default to oauth for backward compatibility)
  const authType = config.google?.authType || "oauth";

  if (authType === "oauth") {
    // Validate OAuth fields
    if (!config.google?.clientId || !config.google?.clientSecret) {
      throw new Error(
        "config.google.clientId and clientSecret are required for OAuth authentication"
      );
    }
    config.google.redirectUri =
      config.google.redirectUri || "http://localhost:3000/oauth/callback";
  } else if (authType === "service_account") {
    // Validate service account credentials are available
    // This will throw if no credentials are found
    loadServiceAccountCredentials(config);
  } else {
    throw new Error(
      `Invalid google.authType: ${authType}. Must be "oauth" or "service_account"`
    );
  }

  // Apply defaults
  config.defaults = {
    maxSearchResults: config.defaults?.maxSearchResults || 10,
    outputFormat: config.defaults?.outputFormat || "markdown",
  };

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

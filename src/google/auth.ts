import { google } from "googleapis";
import { OAuth2Client, Credentials } from "google-auth-library";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createServer } from "http";
import { URL } from "url";
import { Config, getTokensDir } from "../config/loader.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export function createOAuth2Client(config: Config): OAuth2Client {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

function getTokenPath(): string {
  const tokensDir = getTokensDir();
  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }
  return join(tokensDir, "tokens.json");
}

export function loadStoredTokens(): Credentials | null {
  const tokenPath = getTokenPath();
  if (!existsSync(tokenPath)) {
    return null;
  }

  try {
    const tokenData = readFileSync(tokenPath, "utf-8");
    return JSON.parse(tokenData) as Credentials;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Credentials): void {
  const tokenPath = getTokenPath();
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
}

export async function getAuthenticatedClient(
  config: Config
): Promise<OAuth2Client> {
  const oauth2Client = createOAuth2Client(config);
  const storedTokens = loadStoredTokens();

  if (storedTokens) {
    oauth2Client.setCredentials(storedTokens);

    // Check if token needs refresh
    if (storedTokens.expiry_date && storedTokens.expiry_date < Date.now()) {
      if (storedTokens.refresh_token) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          saveTokens(credentials);
          oauth2Client.setCredentials(credentials);
        } catch (error) {
          throw new Error(
            "Failed to refresh access token. Please re-authenticate using: npm run auth"
          );
        }
      } else {
        throw new Error(
          "Access token expired and no refresh token available. Please re-authenticate using: npm run auth"
        );
      }
    }

    return oauth2Client;
  }

  throw new Error(
    "No authentication tokens found. Please authenticate first using: npm run auth"
  );
}

export function getAuthUrl(config: Config): string {
  const oauth2Client = createOAuth2Client(config);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to ensure refresh token
  });
}

export async function exchangeCodeForTokens(
  config: Config,
  code: string
): Promise<Credentials> {
  const oauth2Client = createOAuth2Client(config);
  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

export async function authenticateInteractive(config: Config): Promise<void> {
  return new Promise((resolve, reject) => {
    const redirectUrl = new URL(config.google.redirectUri);
    const port = parseInt(redirectUrl.port) || 3000;

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "", `http://localhost:${port}`);

        if (url.pathname === redirectUrl.pathname || url.pathname === "/oauth/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h1>Authentication Failed</h1><p>Error: ${error}</p>`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (code) {
            try {
              await exchangeCodeForTokens(config, code);
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`
                <html>
                  <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Authentication Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                  </body>
                </html>
              `);
              server.close();
              resolve();
            } catch (tokenError) {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(`<h1>Token Exchange Failed</h1><p>${tokenError}</p>`);
              server.close();
              reject(tokenError);
            }
          } else {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>No authorization code received</h1>");
          }
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } catch (err) {
        reject(err);
      }
    });

    server.listen(port, () => {
      const authUrl = getAuthUrl(config);
      console.log("\n===========================================");
      console.log("Google Drive Authentication Required");
      console.log("===========================================\n");
      console.log("Opening browser for authentication...\n");
      console.log("If the browser doesn't open, visit this URL:\n");
      console.log(authUrl);
      console.log("\n===========================================\n");

      // Try to open browser
      import("open").then((open) => {
        open.default(authUrl).catch(() => {
          console.log("Could not open browser automatically.");
        });
      });
    });

    server.on("error", (err) => {
      reject(err);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out"));
    }, 5 * 60 * 1000);
  });
}

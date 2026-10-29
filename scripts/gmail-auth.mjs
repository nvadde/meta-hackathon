/**
 * Gmail OAuth consent helper.
 *
 * Run: npm run gmail:auth
 *
 * Starts a brief local callback server, prints a Google consent URL, you
 * approve with the mailbox account, and this writes token.json in the
 * project root. Requests the gmail.modify scope (read mail + manage the
 * SIRE/Processed label). Existing code reads token.refresh_token /
 * token.client_id / token.client_secret from that file.
 */
import { writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { readJson, root } from "../invoiceSource/Gmail/gmail-client.mjs";

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

const credentials = await readJson("credentials.json");
const client = credentials.installed || credentials.web || {};
if (!client.client_id || !client.client_secret) {
  console.error("credentials.json has no OAuth client id/secret.");
  process.exit(1);
}

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.searchParams.get("code")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Approved. Return to the terminal.");
      server.close();
      resolve(url.searchParams.get("code"));
    } else {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Not approved: ${url.searchParams.get("error") || "unknown error"}`);
    }
  });
  server.on("error", reject);
  server.listen(PORT, "127.0.0.1", () => {
    console.log("Open this URL, approve with the mailbox account:\n");
    console.log(
      "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          scope: SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent",
        }),
    );
  });
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }),
});
if (!response.ok) {
  console.error(`Code exchange failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}
const data = await response.json();
if (!data.refresh_token) {
  console.error("No refresh_token returned. Revoke prior consent and approve again.");
  process.exit(1);
}

await writeFile(
  path.join(root, "token.json"),
  JSON.stringify(
    {
      token: data.access_token,
      refresh_token: data.refresh_token,
      token_uri: "https://oauth2.googleapis.com/token",
      client_id: client.client_id,
      client_secret: client.client_secret,
      scopes: SCOPES,
      universe_domain: "googleapis.com",
      account: "",
      expiry: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log("token.json written with gmail.modify scope. Re-run npm run watch:gmail.");

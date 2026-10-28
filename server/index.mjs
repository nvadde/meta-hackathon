/**
 * SIRE local backend.
 *
 * Gmail: read-only access using credentials.json (Google OAuth client)
 * and token.json (stored user token) from the project root. Secrets are
 * read here on the server only and are never sent to the browser.
 * Only mailbox profile + recent message metadata are returned.
 *
 * WhatsApp: not connected. A phone number alone cannot connect; that
 * needs a WhatsApp Business (Meta) or Twilio account. The inbox reports
 * it as "Setup pending" until those credentials exist.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDbStatus, getLiveData } from "./db.mjs";
import { isPdfBuffer, nextFileId, storedFileNameFor } from "./manual-upload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env from the project root (DB_USER, DB_PSW, WALLET_LOC, CONFIG_DIR,
// DSN_ADB, WALLET_PSW). Secrets stay on the server.
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  console.warn("No .env file loaded; Oracle DB status will report missing keys.");
}

const PORT = Number(process.env.SIRE_API_PORT || 8787);

async function readJson(name) {
  return JSON.parse(await readFile(path.join(root, name), "utf8"));
}

async function getAccessToken() {
  const credentials = await readJson("credentials.json");
  const token = await readJson("token.json");
  const client = credentials.installed || credentials.web || {};
  const clientId = token.client_id || client.client_id;
  const clientSecret = token.client_secret || client.client_secret;
  if (!clientId || !clientSecret || !token.refresh_token) {
    throw new Error("OAuth client or refresh token missing");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`token refresh failed (${response.status})`);
  const data = await response.json();
  return data.access_token;
}

async function gmail(pathname, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail API failed (${response.status})`);
  return response.json();
}

function headerValue(message, name) {
  const headers = message.payload?.headers || [];
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

/**
 * Serves the source PDF for a file_details row. The browser only ever
 * sends a file_id; the file_path stored in files/file-details.json is
 * resolved here and must stay inside the project files/ directory.
 */
async function serveInvoicePdf(req, res, fileId) {
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const registry = await readJson("files/file-details.json").catch(() => []);
  const entry = registry.find((item) => item.file_id === fileId);
  if (!entry) {
    send(404, { error: "No file_details record for this invoice" });
    return;
  }
  const filesRoot = path.join(root, "files");
  const absolute = path.resolve(root, entry.file_path);
  if (!absolute.startsWith(filesRoot) || !absolute.toLowerCase().endsWith(".pdf")) {
    send(400, { error: "Stored file_path is not a PDF under files/" });
    return;
  }
  try {
    const info = await stat(absolute);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": info.size,
      "Content-Disposition": `inline; filename="${entry.file_name}"`,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(absolute).pipe(res);
  } catch {
    send(404, { error: `PDF not found at stored file_path: ${entry.file_path}` });
  }
}

let cachedGmail = null;
let cachedAt = 0;

async function gmailStatus() {
  if (cachedGmail && Date.now() - cachedAt < 60_000) return cachedGmail;
  const accessToken = await getAccessToken();
  const profile = await gmail("/profile", accessToken);
  const list = await gmail("/messages?maxResults=5", accessToken);
  const recentMessages = [];
  for (const item of list.messages || []) {
    const message = await gmail(
      `/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      accessToken,
    );
    recentMessages.push({
      id: item.id,
      from: headerValue(message, "From"),
      subject: headerValue(message, "Subject"),
      date: headerValue(message, "Date"),
      snippet: message.snippet || "",
    });
  }
  cachedGmail = {
    connected: true,
    emailAddress: profile.emailAddress,
    messagesTotal: profile.messagesTotal,
    recentMessages,
  };
  cachedAt = Date.now();
  return cachedGmail;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Manual Upload: accepts one PDF (raw body, X-File-Name header), stores it
 * under files/invoices/, and registers a file_details row so the invoice
 * detail screen can serve it back from its stored file_path.
 */
async function handleManualUpload(req, res, send) {
  const originalName = decodeURIComponent(req.headers["x-file-name"] || "invoice.pdf");
  if (!/\.pdf$/i.test(originalName)) {
    send(400, { error: "Only PDF files can be uploaded." });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      send(413, { error: "File is too large. The limit is 10 MB." });
      return;
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!isPdfBuffer(buffer)) {
    send(400, { error: "The uploaded file is not a valid PDF." });
    return;
  }

  const invoicesDir = path.join(root, "files", "invoices");
  await mkdir(invoicesDir, { recursive: true });
  const storedName = storedFileNameFor(originalName, Date.now());
  const filePath = `files/invoices/${storedName}`;
  await writeFile(path.join(root, filePath), buffer);

  const registryPath = path.join(root, "files", "file-details.json");
  const registry = await readJson("files/file-details.json").catch(() => []);
  const entry = {
    file_id: nextFileId(registry),
    file_name: storedName,
    file_path: filePath,
    message_id: null,
    status: "A",
    invoice_id: null,
    invoice_number: null,
    original_file_name: originalName,
    source: "Manual Upload",
  };
  registry.push(entry);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  send(201, {
    fileId: entry.file_id,
    fileName: entry.file_name,
    filePath: entry.file_path,
    originalFileName: originalName,
    size: buffer.length,
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    const pdfMatch = req.url?.match(/^\/api\/files\/(\d+)\/document$/);
    if (req.url === "/api/manual-uploads" && req.method === "POST") {
      await handleManualUpload(req, res, send);
    } else if (pdfMatch && (req.method === "GET" || req.method === "HEAD")) {
      await serveInvoicePdf(req, res, Number(pdfMatch[1]));
    } else if (req.url === "/api/db/status") {
      send(200, await getDbStatus());
    } else if (req.url === "/api/live/data") {
      send(200, await getLiveData());
    } else if (req.url === "/api/health") {
      send(200, { ok: true, service: "sire-api" });
    } else if (req.url === "/api/sources/gmail") {
      try {
        send(200, await gmailStatus());
      } catch (error) {
        send(200, { connected: false, error: String(error?.message || error) });
      }
    } else if (req.url === "/api/sources/whatsapp") {
      send(200, {
        connected: false,
        status: "Setup pending",
        detail:
          "WhatsApp needs a WhatsApp Business (Meta) or Twilio account with an access token. A phone number alone cannot connect, so no messages are sent or received.",
      });
    } else {
      send(404, { error: "not found" });
    }
  } catch (error) {
    send(500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SIRE API listening on http://127.0.0.1:${PORT}`);
});

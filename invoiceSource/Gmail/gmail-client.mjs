/**
 * Gmail API client (server-only). Reads OAuth client/refresh token from
 * credentials.json + token.json in the project root; secrets never leave
 * the server.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function readJson(name) {
  return JSON.parse(await readFile(path.join(root, name), "utf8"));
}

export async function getAccessToken() {
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

export async function gmail(pathname, accessToken, { method = "GET", body } = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gmail API failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export function headerValue(message, name) {
  const headers = message.payload?.headers || [];
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

/** Gmail search query: PDFs that have not been marked processed yet. */
export function buildUnprocessedPdfQuery(processedLabel) {
  return `has:attachment filename:pdf -label:${processedLabel}`;
}

export async function listMessages(accessToken, { query = "", maxResults = 5, pageToken } = {}) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  if (pageToken) params.set("pageToken", pageToken);
  return gmail(`/messages?${params.toString()}`, accessToken);
}

/** Find a label by name or create it; returns the label id. */
export async function ensureLabel(name, accessToken) {
  const existing = await gmail("/labels", accessToken);
  const found = (existing.labels || []).find(
    (label) => label.name?.toLowerCase() === name.toLowerCase(),
  );
  if (found) return found.id;
  const created = await gmail("/labels", accessToken, {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  return created.id;
}

/** Move a message to the processed "folder": add the label, archive from INBOX. */
export async function markProcessed(messageId, labelId, accessToken, { archive = true } = {}) {
  const removeLabelIds = archive ? ["INBOX"] : [];
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds }),
    },
  );
  if (!response.ok) throw new Error(`Gmail modify failed (${response.status})`);
  return response.json();
}

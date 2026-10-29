import { getAccessToken, gmail } from "../../invoiceSource/Gmail/gmail-client.mjs";

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
    const headers = message.payload?.headers || [];
    const headerValue = (name) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
    recentMessages.push({
      id: item.id,
      from: headerValue("From"),
      subject: headerValue("Subject"),
      date: headerValue("Date"),
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    res.status(200).json(await gmailStatus());
  } catch (error) {
    res.status(200).json({ connected: false, error: String(error?.message || error) });
  }
}

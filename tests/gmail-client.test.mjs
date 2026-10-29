import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";

import {
  buildUnprocessedPdfQuery,
  ensureLabel,
  markProcessed,
} from "../invoiceSource/Gmail/gmail-client.mjs";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options, calls);
  };
  return calls;
}

const okJson = (data) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
  json: async () => data,
});

describe("gmail-client labels", () => {
  it("builds a query for unprocessed PDF attachments", () => {
    assert.equal(
      buildUnprocessedPdfQuery("SIRE/Processed"),
      "has:attachment filename:pdf -label:SIRE/Processed",
    );
  });

  it("reuses an existing processed label without creating one", async () => {
    const calls = stubFetch(async (url) => {
      assert.match(url, /\/labels$/);
      return okJson({ labels: [{ id: "L1", name: "SIRE/Processed" }] });
    });
    assert.equal(await ensureLabel("SIRE/Processed", "token"), "L1");
    assert.equal(calls.length, 1);
  });

  it("creates the processed label when it does not exist", async () => {
    const calls = stubFetch(async (url, options) => {
      if (options?.method === "POST") return okJson({ id: "L2", name: "SIRE/Processed" });
      return okJson({ labels: [] });
    });
    assert.equal(await ensureLabel("SIRE/Processed", "token"), "L2");
    const created = JSON.parse(calls[1].options.body);
    assert.equal(created.name, "SIRE/Processed");
  });

  it("moves a message by adding the label and archiving from INBOX", async () => {
    const calls = stubFetch(async () => okJson({}));
    await markProcessed("m1", "L1", "token");
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, { addLabelIds: ["L1"], removeLabelIds: ["INBOX"] });
  });
});

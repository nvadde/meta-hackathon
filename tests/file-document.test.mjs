import assert from "node:assert/strict";
import test from "node:test";

import {
  documentFileId,
  findRegistryEntry,
  resolveDocumentEntry,
} from "../server/file-document.mjs";

const bundled = [
  { file_id: 1, file_name: "inv-2041.pdf", file_path: "files/invoices/inv-2041.pdf" },
];

test("registry hit wins without touching Oracle", async () => {
  let dbCalls = 0;
  const result = await resolveDocumentEntry(1, {
    registry: bundled,
    getConnection: async () => {
      dbCalls += 1;
      throw new Error("must not query Oracle on a registry hit");
    },
  });
  assert.equal(result?.entry.file_path, "files/invoices/inv-2041.pdf");
  assert.equal(result?.source, "registry");
  assert.equal(dbCalls, 0);
});

test("live Oracle file_id resolves to its own stored file_path", async () => {
  const connection = {
    async execute() {
      return {
        rows: [
          {
            FILE_ID: 25,
            FILE_NAME: "gmail-1793226427993-844781.pdf",
            FILE_PATH: "files/invoices/gmail-1793226427993-844781.pdf",
          },
        ],
      };
    },
    async close() {},
  };
  const result = await resolveDocumentEntry(25, {
    registry: bundled,
    getConnection: async () => connection,
  });
  assert.equal(result?.entry.file_path, "files/invoices/gmail-1793226427993-844781.pdf");
  assert.equal(result?.source, "oracle");
});

test("Oracle ids colliding with sample ids keep their own file_path", async () => {
  const connection = {
    async execute() {
      return {
        rows: [{ FILE_ID: 5, FILE_NAME: "gmail-x.pdf", FILE_PATH: "files/invoices/gmail-x.pdf" }],
      };
    },
    async close() {},
  };
  const resolved = await resolveDocumentEntry(5, {
    registry: bundled,
    getConnection: async () => connection,
    preferOracle: true,
  });
  assert.equal(resolved?.entry.file_path, "files/invoices/gmail-x.pdf");
  assert.equal(resolved?.source, "oracle");
});

test("unknown file_id resolves to null", async () => {
  const connection = {
    async execute() {
      return { rows: [] };
    },
    async close() {},
  };
  const result = await resolveDocumentEntry(999, {
    registry: bundled,
    getConnection: async () => connection,
  });
  assert.equal(result, null);
});

test("document URLs match with or without a query string", () => {
  assert.equal(documentFileId("/api/files/25/document"), 25);
  assert.equal(documentFileId("/api/files/25/document?scope=live"), 25);
  assert.equal(documentFileId("/api/files/abc/document"), null);
  assert.equal(documentFileId("/api/files/25/other"), null);
  assert.equal(documentFileId(null), null);
});

test("findRegistryEntry matches numeric file_id only", () => {
  assert.equal(findRegistryEntry(bundled, 1)?.file_name, "inv-2041.pdf");
  assert.equal(findRegistryEntry(bundled, 2), undefined);
  assert.equal(findRegistryEntry(bundled, Number.NaN), undefined);
});

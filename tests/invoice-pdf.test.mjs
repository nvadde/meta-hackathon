import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "files", "file-details.json");
const invoicesPath = path.join(root, "src", "data", "invoices.ts");

test("every invoice has a file_details PDF that exists and is served from its stored file_path", () => {
  assert.ok(existsSync(registryPath), "files/file-details.json registry must exist");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  assert.ok(Array.isArray(registry) && registry.length > 0, "registry must list files");

  const fileIds = new Set();
  for (const entry of registry) {
    assert.ok(Number.isInteger(entry.file_id), "file_id must be an integer");
    assert.ok(!fileIds.has(entry.file_id), `duplicate file_id ${entry.file_id}`);
    fileIds.add(entry.file_id);
    assert.ok(entry.file_name?.endsWith(".pdf"), "file_name must be a PDF");
    assert.ok(entry.file_path?.startsWith("files/invoices/"), "file_path must live under files/invoices/");

    const absolute = path.resolve(root, entry.file_path);
    assert.ok(absolute.startsWith(path.join(root, "files")), "file_path must stay inside files/");
    assert.ok(existsSync(absolute), `missing PDF for ${entry.file_path}`);
    const header = readFileSync(absolute).subarray(0, 5).toString("latin1");
    assert.equal(header, "%PDF-", `${entry.file_path} must be a real PDF`);
  }

  const source = readFileSync(invoicesPath, "utf8");
  assert.match(source, /filePath:/, "invoices must store a file_path");
  const invoicePaths = [...source.matchAll(/invoiceNumber:\s*"([^"]+)"/g)].map(
    (m) => `files/invoices/${m[1].toLowerCase()}.pdf`,
  );
  const registryPaths = new Set(registry.map((entry) => entry.file_path));
  assert.equal(
    new Set(invoicePaths).size,
    invoicePaths.length,
    "each synthetic invoice must store exactly one file_path",
  );
  for (const invoicePath of invoicePaths) {
    assert.ok(
      registryPaths.has(invoicePath),
      `synthetic invoice file_path ${invoicePath} must have a file_details registry row`,
    );
  }
});

test("stored invoices with one shared file_id are discarded so details never repeat one attachment", async () => {
  const { sanitizeStoredInvoices, invoices } = await import("../src/data/invoices.ts");
  const corrupted = invoices.map((invoice) => ({
    ...invoice,
    fileId: invoices[0].fileId,
    fileName: invoices[0].fileName,
    filePath: invoices[0].filePath,
  }));
  assert.deepEqual(
    sanitizeStoredInvoices(corrupted, invoices),
    invoices,
    "all records sharing one attachment must fall back to the sample records",
  );
  assert.deepEqual(
    sanitizeStoredInvoices(invoices, []),
    invoices,
    "records with distinct attachments must be kept",
  );
  const scrambled = invoices.map((invoice, index) => ({
    ...invoice,
    amount: invoice.amount + 1,
    fileId: invoices[(index + 3) % invoices.length].fileId,
    fileName: invoices[(index + 3) % invoices.length].fileName,
    filePath: invoices[(index + 3) % invoices.length].filePath,
  }));
  const healed = sanitizeStoredInvoices(scrambled, invoices);
  assert.notEqual(healed, invoices, "edited stored records must be kept, not discarded");
  for (let index = 0; index < invoices.length; index += 1) {
    assert.equal(healed[index].fileId, invoices[index].fileId, `record ${index} heals to its own attachment`);
    assert.equal(healed[index].filePath, invoices[index].filePath, `record ${index} heals to its own file path`);
    assert.equal(healed[index].amount, invoices[index].amount + 1, `record ${index} keeps user edits`);
  }
  assert.equal(
    sanitizeStoredInvoices([{ id: "broken" }], invoices),
    invoices,
    "records missing attachment fields must fall back to the sample records",
  );
});

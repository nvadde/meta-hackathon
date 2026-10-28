import assert from "node:assert/strict";
import test from "node:test";

import {
  isPdfBuffer,
  nextFileId,
  storedFileNameFor,
} from "../server/manual-upload.mjs";

test("manual upload only accepts real PDF content", () => {
  assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7\nrest of file")), true);
  assert.equal(isPdfBuffer(Buffer.from("PK\x03\x04 zip content")), false);
  assert.equal(isPdfBuffer(Buffer.from("")), false);
  assert.equal(isPdfBuffer(Buffer.from("%PD")), false);
});

test("manual upload stored file names are safe and unique-looking", () => {
  const name = storedFileNameFor("../../My Invoice (final).PDF", 12345);
  assert.match(name, /^manual-12345-[a-z0-9-]+\.pdf$/);
  assert.ok(!name.includes(".."));
  assert.ok(!name.includes("/"));
  assert.ok(!name.includes("\\"));
});

test("nextFileId is one more than the largest registered file_id", () => {
  assert.equal(nextFileId([]), 1);
  assert.equal(nextFileId([{ file_id: 3 }, { file_id: 16 }, { file_id: 9 }]), 17);
});

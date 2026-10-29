import assert from "node:assert/strict";
import test from "node:test";

import {
  getWhatsAppStatus,
  storedWhatsappNameFor,
  whatsappFallbackDraft,
  WHATSAPP_FILES_DIR,
} from "../invoiceSource/Whatsapp/whatsapp.mjs";

test("whatsapp channel reports setup-pending and its files folder", () => {
  assert.equal(WHATSAPP_FILES_DIR, "files/Whatsapp");
  const status = getWhatsAppStatus();
  assert.equal(status.connected, false);
  assert.equal(status.status, "Setup pending");
  assert.ok(status.detail.includes("WhatsApp Business"));
});

test("whatsapp receipts get safe names and low-confidence default fields", () => {
  assert.equal(storedWhatsappNameFor("Invoice (1).PDF", 99), "whatsapp-99-invoice-1.pdf");
  const draft = whatsappFallbackDraft({ sender: "+31 6 1234", messageId: "mid.12345678", caption: "April invoice", stamp: 99 });
  assert.equal(draft.invoiceNumber, "WA-12345678");
  assert.equal(draft.vendorName, "+31 6 1234");
  assert.equal(draft.notes, "April invoice");
  assert.equal(draft.lowConfidence, true);
  assert.equal(draft.lines[0].description, "April invoice");
  const anonymous = whatsappFallbackDraft({ sender: "", messageId: null, caption: "", stamp: 99 });
  assert.equal(anonymous.invoiceNumber, "WA-99");
  assert.equal(anonymous.vendorName, "Unknown vendor");
});

/**
 * WhatsApp channel status. A phone number alone cannot connect: this needs
 * a WhatsApp Business (Meta) or Twilio account with an access token.
 * Received files for this channel belong under files/Whatsapp/.
 */
export const WHATSAPP_FILES_DIR = "files/Whatsapp";

export function storedWhatsappNameFor(originalName, stamp) {
  const base = String(originalName || "invoice")
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "invoice";
  return `whatsapp-${stamp}-${base}.pdf`;
}

/**
 * Fallback draft when model extraction fails: a normalized low-confidence
 * draft so the receipt still lands in the tables with Exception status for
 * payables review instead of being lost.
 */
export function whatsappFallbackDraft({ sender, messageId, caption, stamp }) {
  const tag = messageId ? String(messageId).slice(-8) : String(stamp);
  const invoiceNumber = `WA-${tag}`;
  return {
    invoiceNumber,
    vendorName: sender || "Unknown vendor",
    invoiceDate: "",
    dueDate: "",
    amountDue: 0,
    currency: "USD",
    projectNumber: "",
    jobNumber: "",
    paymentTerms: "",
    previousUnpaidBalance: null,
    totalTax: 0,
    totalVat: 0,
    billingAddress: "",
    billingAddressRecipient: "",
    customerAddress: "",
    customerAddressRecipient: "",
    remittanceAddress: "",
    remittanceAddressRecipient: "",
    shippingAddress: "",
    shippingAddressRecipient: "",
    shippingCost: null,
    vendorAddress: "",
    notes: caption || "",
    purchaseOrder: "",
    lines: [
      {
        lineNum: "1",
        name: "",
        productCode: "",
        description: caption || invoiceNumber,
        quantity: 1,
        units: "ea",
        unitPrice: 0,
        amount: 0,
      },
    ],
    lowConfidence: true,
  };
}

export function getWhatsAppStatus() {
  return {
    connected: false,
    status: "Setup pending",
    detail:
      "WhatsApp needs a WhatsApp Business (Meta) or Twilio account with an access token. A phone number alone cannot connect, so no messages are sent or received.",
  };
}

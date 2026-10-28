/**
 * Generates one synthetic source PDF per invoice record and the
 * files/file-details.json registry (mirroring file_details in Tables.sql).
 *
 * Run: npm run generate:pdfs
 * Uses Node's type stripping to read src/data/invoices.ts directly.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { invoices } = await import("../src/data/invoices.ts");

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(amount, currency) {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function wrap(text, max = 88) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function invoiceLines(invoice) {
  const lines = [
    invoice.supplier,
    "SUPPLIER INVOICE (synthetic sample document)",
    "",
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${invoice.invoiceDate}`,
    `Received date: ${invoice.receivedDate}`,
    `Project: ${invoice.project} (${invoice.projectNumber})`,
    `Job number: ${invoice.jobNumber}`,
    "",
    ...wrap(`Bill To: ${invoice.billToAddress}`),
    ...wrap(`Remittance address: ${invoice.remittanceAddress}`),
    "",
    "Lines:",
    ...invoice.lines.flatMap((line) => [
      `${line.lineNum}. ${line.description} - ${line.quantity} ${line.units} x ${money(line.unitPrice, invoice.currency)} = ${money(line.amount, invoice.currency)}`,
    ]),
    "",
    `Amount due: ${money(invoice.amount, invoice.currency)}`,
    "",
    "Synthetic document generated for SIRE UI verification.",
    "It is the source document for the matching synthetic invoice record.",
  ];
  return lines.flatMap((line) => wrap(line));
}

function buildPdf(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 48;
  const top = 792;
  const lineHeight = 15;
  const perPage = 48;
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([""]);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  // 1: catalog, 2: pages, 3: font; page/content objects follow.
  const pageObjectIds = [];
  const contentObjectIds = [];
  // Reserve ids deterministically: catalog=1, pages=2, font=3, then pairs.
  pages.forEach((_, index) => {
    pageObjectIds.push(4 + index * 2);
    contentObjectIds.push(5 + index * 2);
  });

  const bodies = new Map();
  bodies.set(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  bodies.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  bodies.set(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  pages.forEach((pageLines, index) => {
    const commands = ["BT", "/F1 10 Tf", `${lineHeight} TL`, `${left} ${top} Td`];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push("T*");
      commands.push(`(${escapePdfText(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    bodies.set(
      contentObjectIds[index],
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    bodies.set(
      pageObjectIds[index],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
    );
  });

  const maxId = Math.max(...bodies.keys());
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${bodies.get(id)}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

await mkdir(path.join(root, "files", "invoices"), { recursive: true });

const registry = [];
for (const invoice of invoices) {
  const absolute = path.resolve(root, invoice.filePath);
  await writeFile(absolute, buildPdf(invoiceLines(invoice)));
  registry.push({
    file_id: invoice.fileId,
    file_name: invoice.fileName,
    file_path: invoice.filePath,
    message_id: null,
    status: "A",
    invoice_id: invoice.id,
    invoice_number: invoice.invoiceNumber,
  });
}

await writeFile(
  path.join(root, "files", "file-details.json"),
  `${JSON.stringify(registry, null, 2)}\n`,
);
console.log(`Generated ${registry.length} invoice PDFs and files/file-details.json`);

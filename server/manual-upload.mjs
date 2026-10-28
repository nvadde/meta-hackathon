/** Helpers for manual PDF uploads. Kept separate so they can be unit-tested. */

export function isPdfBuffer(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

export function storedFileNameFor(originalName, stamp) {
  const base = String(originalName || "invoice")
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "invoice";
  return `manual-${stamp}-${base}.pdf`;
}

export function nextFileId(registry) {
  return registry.reduce((max, entry) => Math.max(max, Number(entry.file_id) || 0), 0) + 1;
}

import { useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Invoice } from "@/data/invoices";
import { projectFeed } from "@/data/projects";
import { supplierFeed } from "@/data/suppliers";
import { INVALID_SUPPLIER_PROJECT_REMARKS, validateInvoice } from "@/lib/validation";

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface UploadResponse {
  fileId: number;
  fileName: string;
  filePath: string;
  originalFileName: string;
  size: number;
}

export function ManualUpload({
  onAddInvoice,
  onOpenInvoice,
}: {
  onAddInvoice: (invoice: Invoice) => void;
  onOpenInvoice: (invoice: Invoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState<Invoice | null>(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    supplier: "",
    project: "",
    projectNumber: "",
    jobNumber: "",
    invoiceDate: today(),
    receivedDate: today(),
    currency: "USD",
    remittanceAddress: "",
    billToAddress: "",
    lineDescription: "",
    lineQuantity: "1",
    lineUnits: "ea",
    lineAmount: "",
    amount: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const problems: string[] = [];
    if (!file) problems.push("Choose a PDF file to upload.");
    if (file && !/\.pdf$/i.test(file.name)) problems.push("Only PDF files can be uploaded.");
    if (file && file.size > 10 * 1024 * 1024) problems.push("The file is larger than 10 MB.");
    if (!form.invoiceNumber.trim()) problems.push("Invoice number is required.");
    if (!form.supplier.trim()) problems.push("Supplier is required.");
    if (!form.lineDescription.trim()) problems.push("Line description is required.");
    const amount = Number(form.amount);
    const lineAmount = Number(form.lineAmount);
    const lineQuantity = Number(form.lineQuantity);
    if (!Number.isFinite(amount)) problems.push("Header amount must be a number.");
    if (!Number.isFinite(lineAmount)) problems.push("Line amount must be a number.");
    if (!Number.isFinite(lineQuantity)) problems.push("Line quantity must be a number.");
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setBusy(true);
    setErrors([]);
    try {
      const response = await fetch("/api/manual-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Name": encodeURIComponent(file!.name),
        },
        body: file!,
      });
      const data = (await response.json().catch(() => ({}))) as Partial<UploadResponse> & {
        error?: string;
      };
      if (!response.ok || !data.fileId || !data.fileName || !data.filePath) {
        throw new Error(data.error || `Upload failed (${response.status})`);
      }

      const invoice: Invoice = {
        id: `manual-${data.fileId}`,
        fileId: data.fileId,
        fileName: data.fileName,
        filePath: data.filePath,
        invoiceNumber: form.invoiceNumber.trim(),
        supplier: form.supplier.trim(),
        project: form.project.trim(),
        projectNumber: form.projectNumber.trim(),
        jobNumber: form.jobNumber.trim(),
        source: "Manual Upload",
        receivedDate: form.receivedDate || today(),
        invoiceDate: form.invoiceDate || today(),
        amount,
        currency: form.currency.trim().toUpperCase() || "USD",
        status: "Received",
        remittanceAddress: form.remittanceAddress.trim(),
        billToAddress: form.billToAddress.trim(),
        exceptionCount: 0,
        lines: [
          {
            lineNum: "1",
            description: form.lineDescription.trim(),
            quantity: lineQuantity,
            units: form.lineUnits.trim() || "ea",
            unitPrice: lineQuantity !== 0 ? lineAmount / lineQuantity : lineAmount,
            amount: lineAmount,
          },
        ],
      };
      const validation = validateInvoice(invoice, supplierFeed, projectFeed);
      const stored: Invoice =
        validation.level === "invalid" ? { ...invoice, status: "Rejected" } : invoice;
      onAddInvoice(invoice);
      setCreated(stored);
      setFile(null);
    } catch (error) {
      setErrors([
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "The upload backend is not reachable. Start it with npm run server, then try again. Nothing was added.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Manual Upload" className="mb-6 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <Upload aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
        <div>
          <h3 className="font-semibold">Manual Upload</h3>
          <p className="text-sm text-muted-foreground">
            Upload a supplier invoice PDF yourself. It is stored under files/invoices/, registered in
            file_details, and added to this workbench with source “Manual Upload”.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen((current) => !current)} className="ml-auto" aria-expanded={open}>
          <FileUp aria-hidden="true" /> {open ? "Close upload" : "Upload invoice PDF"}
        </Button>
      </div>

      {created && !open && (
        <p className="mt-3 rounded-md bg-teal-soft px-3 py-2 text-sm text-teal-dark dark:bg-teal/20 dark:text-teal">
          Added {created.invoiceNumber} from {created.fileName}.{" "}{created.status === "Rejected" ? `It was automatically rejected: ${INVALID_SUPPLIER_PROJECT_REMARKS}. ` : ""}
          <button type="button" className="font-semibold underline" onClick={() => onOpenInvoice(created)}>
            View Details
          </button>{" "}
          to check it against the PDF.
        </p>
      )}

      {open && (
        <div className="mt-4 border-t pt-4">
          {errors.length > 0 && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <p className="font-semibold">Upload not completed:</p>
              <ul className="list-disc pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          {created && (
            <p className="mb-4 rounded-md bg-teal-soft px-3 py-2 text-sm text-teal-dark dark:bg-teal/20 dark:text-teal">
              Added {created.invoiceNumber} from {created.fileName}.{" "}{created.status === "Rejected" ? `It was automatically rejected: ${INVALID_SUPPLIER_PROJECT_REMARKS}. ` : ""}
              <button type="button" className="font-semibold underline" onClick={() => onOpenInvoice(created)}>
                View Details
              </button>{" "}
              to check it against the PDF, or add another below.
            </p>
          )}

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-semibold">Invoice PDF (required, max 10 MB)</span>
            <Input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file && (
              <span className="mt-1 block text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice number *</span>
              <Input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier *</span>
              <Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</span>
              <Input value={form.project} onChange={(e) => set("project", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project number</span>
              <Input value={form.projectNumber} onChange={(e) => set("projectNumber", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job number</span>
              <Input value={form.jobNumber} onChange={(e) => set("jobNumber", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</span>
              <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={selectClassName}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice date</span>
              <Input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Received date</span>
              <Input type="date" value={form.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Header amount *</span>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remittance address</span>
              <Input value={form.remittanceAddress} onChange={(e) => set("remittanceAddress", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill To address</span>
              <Input value={form.billToAddress} onChange={(e) => set("billToAddress", e.target.value)} />
            </label>
          </div>

          <h4 className="mb-2 mt-4 text-sm font-semibold">First invoice line</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Description *</span>
              <Input value={form.lineDescription} onChange={(e) => set("lineDescription", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</span>
              <Input inputMode="decimal" value={form.lineQuantity} onChange={(e) => set("lineQuantity", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Units</span>
              <Input value={form.lineUnits} onChange={(e) => set("lineUnits", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line Amount *</span>
              <Input inputMode="decimal" value={form.lineAmount} onChange={(e) => set("lineAmount", e.target.value)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={handleSubmit} disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <FileUp aria-hidden="true" />}
              {busy ? "Uploading…" : "Upload and add invoice"}
            </Button>
            <span className="text-sm text-muted-foreground">
              No extraction runs on the PDF. You type the header and first line, then can Edit the
              invoice later to add more lines. Invoice number and supplier cannot be changed after
              creation.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

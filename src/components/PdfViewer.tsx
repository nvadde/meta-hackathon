import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { Invoice } from "@/data/invoices";
import { cn } from "@/lib/utils";

type ViewerState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export function PdfViewer({ invoice }: { invoice: Invoice }) {
  const [state, setState] = useState<ViewerState>({ kind: "loading" });
  const documentUrl = `/api/files/${invoice.fileId}/document`;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ kind: "loading" });

    fetch(documentUrl)
      .then(async (response) => {
        if (!response.ok) {
          let detail = `Request failed (${response.status})`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) detail = data.error;
          } catch {
            // Keep the status-based message.
          }
          throw new Error(detail);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setState({ kind: "ready", url: objectUrl });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              error instanceof Error && error.message !== "Failed to fetch"
                ? error.message
                : "The PDF backend is not reachable. Start it with npm run server, then reopen this invoice.",
          });
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentUrl]);

  return (
    <section aria-label="Source document" className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <FileText aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          Source document
        </h3>
        <span className="text-sm text-muted-foreground">
          {invoice.fileName} · stored at <code className="rounded bg-muted px-1 py-0.5 text-xs">{invoice.filePath}</code>
        </span>
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}
        >
          <ExternalLink aria-hidden="true" /> Open PDF
        </a>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {state.kind === "loading" && (
          <p className="flex h-[420px] items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Loading the PDF from the stored file path…
          </p>
        )}
        {state.kind === "error" && (
          <div className="px-6 py-10 text-center">
            <h4 className="mb-2 font-semibold">PDF not available</h4>
            <p className="mx-auto max-w-[56ch] text-sm text-muted-foreground">{state.message}</p>
            <p className="mx-auto mt-2 max-w-[56ch] text-sm text-muted-foreground">
              Expected file:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{invoice.filePath}</code>. The
              extracted fields above remain visible so this state is clear even without the document.
            </p>
          </div>
        )}
        {state.kind === "ready" && (
          <iframe
            title={`Source PDF for invoice ${invoice.invoiceNumber}`}
            src={state.url}
            className="h-[640px] w-full bg-white"
          />
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Compare this document line by line with the extracted header and lines on this screen before
        trusting the extraction.
      </p>
    </section>
  );
}

const guide = [
  {
    term: "Invoice Workbench",
    detail: "Invoice details with source, status, and the option to upload manually.",
  },
  {
    term: "My Actions",
    detail:
      "Every change you make to an invoice (approve, reject, edit) is recorded here. Manager is notified when you approve or reject.",
  },
  {
    term: "Suppliers",
    detail: "Read-only, synced from the ERP. No edits here.",
  },
  {
    term: "Projects",
    detail: "Read-only, synced from the ERP. No edits here.",
  },
  {
    term: "Notifications",
    detail: "All system and approval notifications in one place.",
  },
  {
    term: "Connections",
    detail: "Live status of each connection: Gmail, WhatsApp, ERP, Oracle database.",
  },
];

export function Overview() {
  return (
    <section aria-label="Overview" className="mx-auto w-full max-w-3xl">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Overview
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">
        SIRE — Smart Ingestion &amp; Reconciliation Engine
      </h2>
      <p className="mb-6 max-w-[68ch] text-muted-foreground">
        SIRE ingests vendor invoices from Gmail, WhatsApp, and manual PDF uploads, extracts their
        data with an agentic ReAct pipeline, and publishes validated, approved invoices to database
        tables. Any ERP or application can be configured to read those tables and write back its
        status — SIRE never pushes into a specific ERP, which keeps it platform-independent.
      </p>

      <dl className="rounded-lg border bg-card p-5 text-card-foreground">
        {guide.map((item) => (
          <div key={item.term} className="gap-2 border-b py-3 last:border-b-0 last:pb-0 first:pt-0">
            <dt className="font-semibold">{item.term}</dt>
            <dd className="text-sm text-muted-foreground">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

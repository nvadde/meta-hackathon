# SIRE — Smart Ingestion & Reconciliation Engine

React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and Lucide icons.

Current scope: application shell, the Invoice Workbench, and the My Actions invoice
review workbench with clearly labeled synthetic records (search, filters,
sorting, pagination, an editable invoice detail screen, and the source PDF).
No extraction, ERP posting, or database yet.

## Run

The workbench can also show live, read-only Gmail mailbox metadata. That needs the
local backend running next to Vite:

```powershell
npm install
npm run server   # terminal 1 — local API on http://127.0.0.1:8787
npm run dev      # terminal 2 — app on http://localhost:5173
```

Then open http://localhost:5173 in your browser and choose **Invoice Workbench**.

Without `npm run server`, the workbench still works with synthetic records and the
Gmail panel reports the backend as not running.

## Database schema

`Tables.sql` (Oracle style) covers the whole application: `file_details`,
`invoice_header`, and `invoice_lines` (extended with processing status,
exception count, payables-review confirmation, received date, and line units);
ERP feed tables `supplier_master` and `project_master`; the My Actions change
log `invoice_review_action`; Payables Manager `notification`s; the
`erp_invoice_queue` for approved invoices awaiting ERP pickup; `currency_rate`
for USD conversion (sample rates flagged, not live FX); and `code_lov` seeded
with the source channels (Gmail, WhatsApp, Manual Upload) and all processing
statuses including Approved and Rejected.

The backend connects to Oracle Autonomous Database with the wallet and
`.env` (`DB_USER`, `DB_PSW`, `WALLET_LOC`, `CONFIG_DIR`, `DSN_ADB`,
`WALLET_PSW`) using node-oracledb thin mode. Secrets stay on the server;
`GET /api/db/status` reports only the user, DSN alias, wallet-configured
flag, which SIRE tables exist, and their row counts. The **Connections**
screen shows this live.

Create (or safely re-run) the schema with:

```powershell
npm run db:create-tables
```

This executes `Tables.sql` statement by statement and reports anything that
already exists instead of failing. The tables have been created in the
configured database; supplier/project/invoice tables are still empty, so the
app keeps using synthetic in-browser records until data is loaded into them.

## Invoice Workbench

- Synthetic records in `src/data/invoices.ts`, mapped to the fields in
  `Tables.sql` (`invoice_header` / `invoice_lines`).
- Columns: invoice number, supplier, project, source channel, received date,
  amount with currency, processing status, Remittance address, Bill To address,
  Job / Project number, and exception count.
- Search, source/status/project/currency filters, sorting, and pagination.
- **View Details** opens the detail screen: Item Description, Quantity, units,
  and Amount, with the lines total shown in the invoice currency only.
- The **header toggle (Sample / Live)** switches every screen between the
  synthetic records and live Oracle data. Live mode reads `SUPPLIER_MASTER`,
  `PROJECT_MASTER`, `INVOICE_HEADER`, and `INVOICE_LINES` through
  `GET /api/live/data` (mapped in `server/live-data.mjs`). It is read-only in
  this step — the detail screen disables editing, approval, rejection, and
  Manual Upload until invoice write-back is connected. Because the Oracle
  tables are currently empty, Live mode shows empty tables with an explicit
  “empty Oracle tables” notice, and Live rows with files map to PDFs the same
  way (`file_path` → document endpoint). Notifications, My changes, and
  sample edits only exist in Sample mode.
- The detail screen also displays the actual source PDF, served from the
  `file_details.file_path` stored for that invoice, so a human can verify the
  extraction against the document. PDFs live in `files/invoices/`, the
  registry is `files/file-details.json`, and the backend serves
  `GET /api/files/<file_id>/document`. Regenerate with `npm run generate:pdfs`.
  If the backend is not running or the file is missing, the screen shows a
  clear "PDF not available" state instead of a blank viewer.
- Amounts are never combined across currencies; totals are shown per currency.
- The workbench also has an **Amount in USD** column (sortable) converting every
  invoice with static sample rates — EUR 1.08 and GBP 1.27 per USD — labeled on
  screen as “Sample rates (not live FX)”. Unknown currencies show “—” instead of
  a guessed value, and original-currency amounts remain the records of truth.
  Live FX rates are not connected.
- Source channels are Gmail, WhatsApp, and Manual Upload. Badges on synthetic
  records are sample source labels, not live connections. Records saved by
  earlier versions with the old source name “Upload” are shown as Manual Upload.
- **Manual Upload works:** on the workbench, choose **Upload invoice PDF**,
  select a PDF (max 10 MB), and enter the invoice number, supplier, header
  amount, and first line. `POST /api/manual-uploads` stores the file under
  `files/invoices/`, adds a `file_details` row to `files/file-details.json`,
  and the new record appears in the table with source Manual Upload. Open
  **View Details** to see it with its PDF below the lines. No extraction runs
  on the PDF — the values are typed by the user, and extra lines can be added
  later with Edit. This needs `npm run server`; without the backend the form
  reports that the upload backend is not reachable and adds nothing.
  Note: rerunning `npm run generate:pdfs` rewrites the registry from the
  synthetic records, so manually uploaded registry rows would need to be kept
  separately after that.

## Suppliers

- Supplier Details feed received from ERP, shown as a clearly labeled synthetic
  sample feed in `src/data/suppliers.ts` because ERP is not connected and no
  live ERP data is fetched.
- Columns: supplier, status (Active/Inactive), start date, end date, supplier
  site, supplier address, and No. of invoices. The invoice count is computed
  live from the current workbench records, so edits and Manual Uploads change it.
- Search by supplier, site, or address; filter by status or supplier site;
  sort by supplier, start date, or No. of invoices; pagination at 8 per page.
- Clicking a supplier (or **View invoices**) lists that supplier's invoices.
  From there, clicking an invoice number or **View Details** opens the invoice
  detail screen, and Back returns through the supplier's invoices to Suppliers.
- A supplier that appears only on an invoice (for example a new Manual Upload
  supplier) is listed with a “Not in ERP feed” badge instead of being hidden.

## Projects

- Project Details feed received from ERP, shown as a clearly labeled synthetic
  sample feed in `src/data/projects.ts` because ERP is not connected and no
  live ERP data is fetched.
- Columns: Project (with project number), status (Active/Inactive), start
  date, end date, project address, and No. of invoices. The invoice count is
  computed live from the current workbench records, so edits and Manual
  Uploads change it.
- Search by project, project number, or address; filter by status; sort by
  project, start date, or No. of invoices; pagination at 8 per page.
- Clicking a project (or **View invoices**) lists that project's invoices.
  From there, clicking an invoice number or **View Details** opens the invoice
  detail screen, and Back returns through the project's invoices to Projects.
- A project that appears only on an invoice (for example a new Manual Upload
  project) is listed with a “Not in ERP feed” badge instead of being hidden.

## Validation rules

- **Unknown supplier or project:** if an invoice's supplier is not in the
  Suppliers screen (ERP supplier feed), or its project is not in the Projects
  screen (ERP project feed), the invoice is invalid. Approval is blocked in
  the workbench, My Actions, Suppliers, and Projects tables (red badge) and on
  the detail screen. It should be rejected with the remarks “Not a valid
  supplier or project. Contact payablesmanager@sire.com” — the detail screen
  offers these remarks prefilled, the contact is a mailto link, and a Manual
  Upload with an unknown supplier or project is automatically stored as
  Rejected with that reason in My changes. No email is sent automatically.
- **Inactive supplier:** if the supplier is in the feed but Inactive, the
  invoice is flagged “Payables review required”. Approving or rejecting —
  with the decision buttons or by changing the status in Edit — is blocked
  until the user ticks “Payables team review confirmed” on the detail screen.
  The confirmation is saved on the invoice and recorded in My changes.
- **Inactive project:** the same payables-team-review gate applies when the
  project is in the feed but Inactive.
- Active, known supplier and project invoices pass validation with no flag.
  These checks sit on top of the existing approval rules (exceptions resolved
  and lines total equal to the header amount).

## My Actions — invoice review workbench

- Lists invoices that need review (exception count above 0 or status
  Exception), invoices you have edited, and invoices you have approved, with
  the same search, filters, sorting, and pagination as the workbench. Amounts stay
  separate per currency.
- On any invoice detail screen, **Edit** makes the header and lines editable
  (Item Description, Quantity, units, Amount; lines can be added or removed).
  **Save** validates the values, applies them everywhere (Invoice Workbench, My Actions,
  detail), marks the invoice “Edited by me”, and records each changed field
  with its old and new value under **My changes** in My Actions.
- **Approve invoice** is enabled only when the exception count is 0 and the
  lines total equals the header amount. Approved invoices are marked “Approved —
  awaiting ERP”.
- Approving — with the Approve button or by changing the processing status to
  Approved in Edit and saving — **requires remarks/comments**. Saving creates an
  in-app notification to **Payables Manager** with those remarks; it is listed
  in Notifications, counted in the top bar and sidebar, and recorded in My
  changes. No email or external message is sent.
- The processing status list of values is Received, Processing, Matched,
  Exception, Ready, Approved, and **Rejected**.
- On the detail screen, invoice number, supplier, project, and source channel
  are non-editable. All other header fields and the lines can be corrected.
- Edits are stored only in this browser (localStorage). **Reset sample data**
  in My Actions restores the original synthetic records and clears the log.
- ERP integration is **not connected**: approved invoices are queued for ERP
  pickup only. Nothing is sent to an ERP and no ERP invoice is created.

## Live sources

- **Gmail (live, read-only):** `server/index.mjs` reads `credentials.json`
  (Google OAuth client) and `token.json` from the project root on the server
  only, refreshes the access token, and returns the mailbox profile and recent
  message subjects via `/api/sources/gmail`. Secrets are never sent to the
  browser. No invoice extraction runs on those messages yet.
- **WhatsApp (setup pending):** a phone number alone cannot connect. It needs a
  WhatsApp Business (Meta) or Twilio account with an access token. Until then,
  no WhatsApp messages are sent or received.

Keep `credentials.json` and `token.json` private. They are listed in
`.gitignore`; do not commit or share them.

## Build

```powershell
npm run build
npm run preview
```

## Structure

- `src/App.tsx` — layout, section state, workbench/detail navigation
- `src/components/InvoiceWorkbench.tsx` — table, search, filters, sorting, pagination
- `src/components/InvoiceDetail.tsx` — invoice line detail screen
- `src/components/PdfViewer.tsx` — source PDF viewer on the detail screen
- `src/components/Notifications.tsx` — Payables Manager approval notifications
- `src/lib/review.ts` — change log, approval, and notification logic (tested in `tests/review.test.mjs`)
- `scripts/generate-invoice-pdfs.mjs` — generates the synthetic PDFs + registry
- `tests/invoice-pdf.test.mjs` — checks every invoice PDF exists at its stored path (run `npm test`)
- `src/components/SourceConnections.tsx` — live Gmail status, WhatsApp pending state
- `src/components/AppSidebar.tsx`, `src/components/TopBar.tsx`, `src/components/EmptyState.tsx` — shell
- `src/components/ui/` — shadcn/ui components (`button`, `badge`, `input`)
- `src/data/invoices.ts` — synthetic invoice records
- `src/data/sections.ts` — shell section definitions
- `server/index.mjs` — local backend (Gmail read-only API)

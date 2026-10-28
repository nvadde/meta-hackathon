/**
 * Synthetic invoice records for the Invoice Workbench.
 *
 * Field names follow Tables.sql (invoice_header / invoice_lines):
 * invoice_number, vendor/supplier name, project_number, job_number,
 * invoice_source, amount_due, invoice_currency, remittance_address,
 * billing/customer address (shown as Bill To), and line quantity /
 * unit_price / amount / description.
 *
 * These are sample records only. Source badges on these records are
 * sample labels, not live connections.
 */

export type InvoiceSource = "Gmail" | "WhatsApp" | "Manual Upload";

/** Source channel list of values (LOV): Gmail, WhatsApp, and Manual Upload. */
export const invoiceSources: InvoiceSource[] = ["Gmail", "WhatsApp", "Manual Upload"];

export type ProcessingStatus =
  | "Received"
  | "Processing"
  | "Matched"
  | "Exception"
  | "Ready"
  | "Approved"
  | "Rejected";

/** Processing status list of values (LOV) used by filters and the detail screen. */
export const processingStatuses: ProcessingStatus[] = [
  "Received",
  "Processing",
  "Matched",
  "Exception",
  "Ready",
  "Approved",
  "Rejected",
];

export interface InvoiceLine {
  lineNum: string;
  description: string;
  quantity: number;
  units: string;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  /** file_details.file_id for the source document. */
  fileId: number;
  /** file_details.file_name for the source document. */
  fileName: string;
  /** file_details.file_path the PDF is served from. */
  filePath: string;
  invoiceNumber: string;
  supplier: string;
  project: string;
  projectNumber: string;
  jobNumber: string;
  source: InvoiceSource;
  receivedDate: string;
  invoiceDate: string;
  amount: number;
  currency: string;
  status: ProcessingStatus;
  remittanceAddress: string;
  billToAddress: string;
  exceptionCount: number;
  /** Set when the payables team has reviewed an inactive supplier/project invoice. */
  payablesReviewConfirmed?: boolean;
  lines: InvoiceLine[];
}

type InvoiceRecord = Omit<Invoice, "fileId" | "fileName" | "filePath">;

const invoiceRecords: InvoiceRecord[] = [
  {
    id: "inv-1001",
    invoiceNumber: "INV-2041",
    supplier: "Atlas Concrete Ltd",
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    jobNumber: "JOB-5501",
    source: "Gmail",
    receivedDate: "2026-10-26",
    invoiceDate: "2026-10-24",
    amount: 18450,
    currency: "USD",
    status: "Matched",
    remittanceAddress: "Atlas Concrete Ltd, 44 Quarry Rd, Austin, TX",
    billToAddress: "SIRE Projects, Riverside Tower Site Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Ready-mix concrete C30", quantity: 120, units: "m3", unitPrice: 120, amount: 14400 },
      { lineNum: "2", description: "Concrete pump hire", quantity: 3, units: "days", unitPrice: 850, amount: 2550 },
      { lineNum: "3", description: "Delivery surcharge", quantity: 15, units: "loads", unitPrice: 100, amount: 1500 },
    ],
  },
  {
    id: "inv-1002",
    invoiceNumber: "INV-2042",
    supplier: "Northgate Steelworks",
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    jobNumber: "JOB-5502",
    source: "Manual Upload",
    receivedDate: "2026-10-26",
    invoiceDate: "2026-10-23",
    amount: 32780.5,
    currency: "USD",
    status: "Processing",
    remittanceAddress: "Northgate Steelworks, 9 Foundry Way, Pittsburgh, PA",
    billToAddress: "SIRE Projects, Riverside Tower Site Office",
    exceptionCount: 1,
    lines: [
      { lineNum: "1", description: "Structural steel beams S355", quantity: 14, units: "tonnes", unitPrice: 2100, amount: 29400 },
      { lineNum: "2", description: "Cutting and drilling", quantity: 26, units: "hrs", unitPrice: 130.02, amount: 3380.5 },
    ],
  },
  {
    id: "inv-1003",
    invoiceNumber: "INV-7780",
    supplier: "Meridian Electrical",
    project: "Harbor Bridge Renewal",
    projectNumber: "PRJ-204",
    jobNumber: "JOB-7710",
    source: "WhatsApp",
    receivedDate: "2026-10-25",
    invoiceDate: "2026-10-25",
    amount: 6420,
    currency: "EUR",
    status: "Received",
    remittanceAddress: "Meridian Electrical, Calle Puerto 18, Valencia",
    billToAddress: "SIRE Projects, Harbor Bridge Depot",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Cable tray installation", quantity: 180, units: "m", unitPrice: 24, amount: 4320 },
      { lineNum: "2", description: "Junction boxes IP65", quantity: 60, units: "ea", unitPrice: 35, amount: 2100 },
    ],
  },
  {
    id: "inv-1004",
    invoiceNumber: "INV-7781",
    supplier: "Summit Scaffolding",
    project: "Harbor Bridge Renewal",
    projectNumber: "PRJ-204",
    jobNumber: "JOB-7711",
    source: "Gmail",
    receivedDate: "2026-10-25",
    invoiceDate: "2026-10-22",
    amount: 9875.25,
    currency: "EUR",
    status: "Exception",
    remittanceAddress: "Summit Scaffolding, Dockyard 4, Rotterdam",
    billToAddress: "SIRE Projects, Harbor Bridge Depot",
    exceptionCount: 3,
    lines: [
      { lineNum: "1", description: "Scaffold tower hire", quantity: 5, units: "weeks", unitPrice: 1450, amount: 7250 },
      { lineNum: "2", description: "Erection crew", quantity: 35, units: "hrs", unitPrice: 75.01, amount: 2625.25 },
    ],
  },
  {
    id: "inv-1005",
    invoiceNumber: "INV-3090",
    supplier: "BlueRock Aggregates",
    project: "Airport Link Road",
    projectNumber: "PRJ-318",
    jobNumber: "JOB-9020",
    source: "Manual Upload",
    receivedDate: "2026-10-24",
    invoiceDate: "2026-10-21",
    amount: 45200,
    currency: "GBP",
    status: "Ready",
    remittanceAddress: "BlueRock Aggregates, Quarry Lane, Leeds",
    billToAddress: "SIRE Projects, Airport Link Compound",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Crushed rock Type 1", quantity: 800, units: "tonnes", unitPrice: 42, amount: 33600 },
      { lineNum: "2", description: "Haulage", quantity: 80, units: "loads", unitPrice: 145, amount: 11600 },
    ],
  },
  {
    id: "inv-1006",
    invoiceNumber: "INV-3091",
    supplier: "Cedar Formwork Co",
    project: "Airport Link Road",
    projectNumber: "PRJ-318",
    jobNumber: "JOB-9021",
    source: "Gmail",
    receivedDate: "2026-10-24",
    invoiceDate: "2026-10-20",
    amount: 12740,
    currency: "GBP",
    status: "Matched",
    remittanceAddress: "Cedar Formwork Co, Unit 7 Timber Park, Bristol",
    billToAddress: "SIRE Projects, Airport Link Compound",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Formwork panels", quantity: 140, units: "ea", unitPrice: 68, amount: 9520 },
      { lineNum: "2", description: "Props and braces hire", quantity: 4, units: "weeks", unitPrice: 805, amount: 3220 },
    ],
  },
  {
    id: "inv-1007",
    invoiceNumber: "CN-0115",
    supplier: "Atlas Concrete Ltd",
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    jobNumber: "JOB-5501",
    source: "Gmail",
    receivedDate: "2026-10-23",
    invoiceDate: "2026-10-23",
    amount: -1250,
    currency: "USD",
    status: "Exception",
    remittanceAddress: "Atlas Concrete Ltd, 44 Quarry Rd, Austin, TX",
    billToAddress: "SIRE Projects, Riverside Tower Site Office",
    exceptionCount: 2,
    lines: [
      { lineNum: "1", description: "Credit memo - returned concrete", quantity: -10, units: "m3", unitPrice: 125, amount: -1250 },
    ],
  },
  {
    id: "inv-1008",
    invoiceNumber: "INV-4410",
    supplier: "Vertex Surveying",
    project: "Metro Station Fit-Out",
    projectNumber: "PRJ-422",
    jobNumber: "JOB-3310",
    source: "WhatsApp",
    receivedDate: "2026-10-23",
    invoiceDate: "2026-10-22",
    amount: 3860,
    currency: "USD",
    status: "Received",
    remittanceAddress: "Vertex Surveying, 120 Meridian St, Denver, CO",
    billToAddress: "SIRE Projects, Metro Station Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Topographic survey", quantity: 2, units: "days", unitPrice: 1400, amount: 2800 },
      { lineNum: "2", description: "Survey report and drawings", quantity: 1, units: "ea", unitPrice: 1060, amount: 1060 },
    ],
  },
  {
    id: "inv-1009",
    invoiceNumber: "INV-4411",
    supplier: "Harbor Plant Hire",
    project: "Metro Station Fit-Out",
    projectNumber: "PRJ-422",
    jobNumber: "JOB-3311",
    source: "Manual Upload",
    receivedDate: "2026-10-22",
    invoiceDate: "2026-10-19",
    amount: 22150,
    currency: "USD",
    status: "Processing",
    remittanceAddress: "Harbor Plant Hire, 3 Dockside Ave, Seattle, WA",
    billToAddress: "SIRE Projects, Metro Station Office",
    exceptionCount: 1,
    lines: [
      { lineNum: "1", description: "Tower crane hire", quantity: 1, units: "month", unitPrice: 18500, amount: 18500 },
      { lineNum: "2", description: "Operator overtime", quantity: 30, units: "hrs", unitPrice: 121.67, amount: 3650 },
    ],
  },
  {
    id: "inv-1010",
    invoiceNumber: "INV-4412",
    supplier: "Lumen Lighting GmbH",
    project: "Metro Station Fit-Out",
    projectNumber: "PRJ-422",
    jobNumber: "JOB-3312",
    source: "Gmail",
    receivedDate: "2026-10-22",
    invoiceDate: "2026-10-18",
    amount: 15890.4,
    currency: "EUR",
    status: "Matched",
    remittanceAddress: "Lumen Lighting GmbH, Lichtstrasse 9, Hamburg",
    billToAddress: "SIRE Projects, Metro Station Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Platform luminaires", quantity: 96, units: "ea", unitPrice: 142.4, amount: 13670.4 },
      { lineNum: "2", description: "Emergency lighting modules", quantity: 40, units: "ea", unitPrice: 55.5, amount: 2220 },
    ],
  },
  {
    id: "inv-1011",
    invoiceNumber: "INV-5520",
    supplier: "Delta Drainage",
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    jobNumber: "JOB-5503",
    source: "WhatsApp",
    receivedDate: "2026-10-21",
    invoiceDate: "2026-10-21",
    amount: 7745,
    currency: "USD",
    status: "Ready",
    remittanceAddress: "Delta Drainage, 88 Canal St, Chicago, IL",
    billToAddress: "SIRE Projects, Riverside Tower Site Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Drainage pipe DN300", quantity: 220, units: "m", unitPrice: 28.5, amount: 6270 },
      { lineNum: "2", description: "Inspection chambers", quantity: 5, units: "ea", unitPrice: 295, amount: 1475 },
    ],
  },
  {
    id: "inv-1012",
    invoiceNumber: "INV-5521",
    supplier: "Northgate Steelworks",
    project: "Harbor Bridge Renewal",
    projectNumber: "PRJ-204",
    jobNumber: "JOB-7712",
    source: "Gmail",
    receivedDate: "2026-10-21",
    invoiceDate: "2026-10-17",
    amount: 51360,
    currency: "EUR",
    status: "Processing",
    remittanceAddress: "Northgate Steelworks, 9 Foundry Way, Pittsburgh, PA",
    billToAddress: "SIRE Projects, Harbor Bridge Depot",
    exceptionCount: 2,
    lines: [
      { lineNum: "1", description: "Bridge bearing plates", quantity: 24, units: "ea", unitPrice: 1980, amount: 47520 },
      { lineNum: "2", description: "Anchor bolt sets", quantity: 96, units: "sets", unitPrice: 40, amount: 3840 },
    ],
  },
  {
    id: "inv-1013",
    invoiceNumber: "INV-6601",
    supplier: "Falcon Safety Supply",
    project: "Airport Link Road",
    projectNumber: "PRJ-318",
    jobNumber: "JOB-9022",
    source: "Manual Upload",
    receivedDate: "2026-10-20",
    invoiceDate: "2026-10-16",
    amount: 2985.6,
    currency: "GBP",
    status: "Received",
    remittanceAddress: "Falcon Safety Supply, Unit 2 Safety Park, Milton Keynes",
    billToAddress: "SIRE Projects, Airport Link Compound",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Safety barriers", quantity: 60, units: "ea", unitPrice: 38.6, amount: 2316 },
      { lineNum: "2", description: "Hi-vis and PPE sets", quantity: 24, units: "sets", unitPrice: 27.9, amount: 669.6 },
    ],
  },
  {
    id: "inv-1014",
    invoiceNumber: "INV-6602",
    supplier: "Summit Scaffolding",
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    jobNumber: "JOB-5504",
    source: "Gmail",
    receivedDate: "2026-10-20",
    invoiceDate: "2026-10-15",
    amount: 11480,
    currency: "USD",
    status: "Matched",
    remittanceAddress: "Summit Scaffolding, Dockyard 4, Rotterdam",
    billToAddress: "SIRE Projects, Riverside Tower Site Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Facade scaffold hire", quantity: 4, units: "weeks", unitPrice: 2400, amount: 9600 },
      { lineNum: "2", description: "Debris netting", quantity: 470, units: "m2", unitPrice: 4, amount: 1880 },
    ],
  },
  {
    id: "inv-1015",
    invoiceNumber: "DM-0207",
    supplier: "Meridian Electrical",
    project: "Harbor Bridge Renewal",
    projectNumber: "PRJ-204",
    jobNumber: "JOB-7710",
    source: "WhatsApp",
    receivedDate: "2026-10-19",
    invoiceDate: "2026-10-19",
    amount: 940,
    currency: "EUR",
    status: "Received",
    remittanceAddress: "Meridian Electrical, Calle Puerto 18, Valencia",
    billToAddress: "SIRE Projects, Harbor Bridge Depot",
    exceptionCount: 1,
    lines: [
      { lineNum: "1", description: "Debit memo - additional call-out", quantity: 8, units: "hrs", unitPrice: 117.5, amount: 940 },
    ],
  },
  {
    id: "inv-1016",
    invoiceNumber: "INV-7700",
    supplier: "BlueRock Aggregates",
    project: "Metro Station Fit-Out",
    projectNumber: "PRJ-422",
    jobNumber: "JOB-3313",
    source: "Gmail",
    receivedDate: "2026-10-19",
    invoiceDate: "2026-10-14",
    amount: 6640,
    currency: "USD",
    status: "Ready",
    remittanceAddress: "BlueRock Aggregates, Quarry Lane, Leeds",
    billToAddress: "SIRE Projects, Metro Station Office",
    exceptionCount: 0,
    lines: [
      { lineNum: "1", description: "Ballast and sub-base", quantity: 160, units: "tonnes", unitPrice: 36, amount: 5760 },
      { lineNum: "2", description: "Weekend delivery", quantity: 8, units: "loads", unitPrice: 110, amount: 880 },
    ],
  },
];

/**
 * Each record links to its source document the way Tables.sql does:
 * invoice_header references a file_details row, and the PDF itself is
 * served from that row's file_path (files/invoices/<invoice-number>.pdf).
 * Run `npm run generate:pdfs` to (re)create the PDFs and the
 * files/file-details.json registry from these records.
 */
export const invoices: Invoice[] = invoiceRecords.map((record, index) => {
  const fileName = `${record.invoiceNumber.toLowerCase()}.pdf`;
  return {
    ...record,
    fileId: index + 1,
    fileName,
    filePath: `files/invoices/${fileName}`,
  };
});

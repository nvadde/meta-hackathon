/**
 * Synthetic supplier master data, presented as a sample "Supplier Details
 * feed received from ERP". ERP is not connected, so this feed is a local
 * sample with the shape such a feed would have. It is not live ERP data.
 *
 * Supplier names match the suppliers used by the synthetic invoices so the
 * "No. of invoices" count can be computed from the workbench records.
 */

export type SupplierStatus = "Active" | "Inactive";

export interface SupplierFeedRecord {
  supplier: string;
  status: SupplierStatus;
  /** Feed start date (ISO). */
  startDate: string;
  /** Feed end date (ISO), or null when the relationship is open-ended. */
  endDate: string | null;
  site: string;
  address: string;
}

export const supplierFeed: SupplierFeedRecord[] = [
  {
    supplier: "Atlas Concrete Ltd",
    status: "Active",
    startDate: "2023-02-01",
    endDate: null,
    site: "Austin Plant",
    address: "44 Quarry Rd, Austin, TX",
  },
  {
    supplier: "BlueRock Aggregates",
    status: "Active",
    startDate: "2022-06-15",
    endDate: null,
    site: "Leeds Quarry",
    address: "Quarry Lane, Leeds",
  },
  {
    supplier: "Cedar Formwork Co",
    status: "Inactive",
    startDate: "2021-09-01",
    endDate: "2025-12-31",
    site: "Bristol Yard",
    address: "Unit 7 Timber Park, Bristol",
  },
  {
    supplier: "Delta Drainage",
    status: "Active",
    startDate: "2024-01-10",
    endDate: null,
    site: "Chicago Depot",
    address: "88 Canal St, Chicago, IL",
  },
  {
    supplier: "Falcon Safety Supply",
    status: "Active",
    startDate: "2023-11-20",
    endDate: null,
    site: "Milton Keynes Store",
    address: "Unit 2 Safety Park, Milton Keynes",
  },
  {
    supplier: "Harbor Plant Hire",
    status: "Active",
    startDate: "2022-03-05",
    endDate: null,
    site: "Seattle Dockside",
    address: "3 Dockside Ave, Seattle, WA",
  },
  {
    supplier: "Lumen Lighting GmbH",
    status: "Active",
    startDate: "2024-05-01",
    endDate: null,
    site: "Hamburg Office",
    address: "Lichtstrasse 9, Hamburg",
  },
  {
    supplier: "Meridian Electrical",
    status: "Active",
    startDate: "2023-07-18",
    endDate: null,
    site: "Valencia Branch",
    address: "Calle Puerto 18, Valencia",
  },
  {
    supplier: "Northgate Steelworks",
    status: "Active",
    startDate: "2021-04-12",
    endDate: null,
    site: "Pittsburgh Works",
    address: "9 Foundry Way, Pittsburgh, PA",
  },
  {
    supplier: "Summit Scaffolding",
    status: "Inactive",
    startDate: "2020-10-01",
    endDate: "2026-03-31",
    site: "Rotterdam Dockyard",
    address: "Dockyard 4, Rotterdam",
  },
  {
    supplier: "Vertex Surveying",
    status: "Active",
    startDate: "2024-09-01",
    endDate: null,
    site: "Denver Office",
    address: "120 Meridian St, Denver, CO",
  },
];

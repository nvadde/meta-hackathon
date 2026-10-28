/**
 * Synthetic project master data, presented as a sample "Project Details
 * feed received from ERP". ERP is not connected, so this feed is a local
 * sample with the shape such a feed would have. It is not live ERP data.
 *
 * Project names and numbers match the synthetic invoices so the
 * "No. of invoices" count can be computed from the workbench records.
 */

export type ProjectStatus = "Active" | "Inactive";

export interface ProjectFeedRecord {
  project: string;
  projectNumber: string;
  status: ProjectStatus;
  /** Feed start date (ISO). */
  startDate: string;
  /** Feed end date (ISO), or null when the project is open-ended. */
  endDate: string | null;
  address: string;
}

export const projectFeed: ProjectFeedRecord[] = [
  {
    project: "Riverside Tower",
    projectNumber: "PRJ-101",
    status: "Active",
    startDate: "2024-03-01",
    endDate: null,
    address: "Riverside Tower Site Office, 12 Riverbank Ave",
  },
  {
    project: "Harbor Bridge Renewal",
    projectNumber: "PRJ-204",
    status: "Active",
    startDate: "2023-08-14",
    endDate: null,
    address: "Harbor Bridge Depot, Pier 6, Harbor District",
  },
  {
    project: "Airport Link Road",
    projectNumber: "PRJ-318",
    status: "Inactive",
    startDate: "2022-05-09",
    endDate: "2026-06-30",
    address: "Airport Link Compound, Cargo Rd Gate 3",
  },
  {
    project: "Metro Station Fit-Out",
    projectNumber: "PRJ-422",
    status: "Active",
    startDate: "2025-01-20",
    endDate: null,
    address: "Metro Station Office, Central Concourse Level 1",
  },
];

import { Building2, FolderKanban, RefreshCw } from "lucide-react";

export function Settings() {
  return (
    <section aria-label="Settings" className="mx-auto w-full max-w-3xl">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        Settings
      </p>
      <h2 className="mb-2 text-[28px] font-semibold leading-tight">
        Settings
      </h2>
      <div className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex items-center gap-2">
          <Building2 aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">Suppliers</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Suppliers are configured in the ERP system. A feed from ERP
          populates the Suppliers screen. Every day, an incremental load
          from ERP is fed into SIRE.
        </p>
      </div>

      <div className="mt-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex items-center gap-2">
          <FolderKanban aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">Projects</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Project details are configured in the ERP system. A feed from ERP
          publishes to the Projects screen. Every day, an incremental feed
          from ERP is fed into SIRE.
        </p>
      </div>

      <div className="mt-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw aria-hidden="true" className="h-5 w-5 text-teal-dark dark:text-teal" />
          <h3 className="font-semibold">Feed schedule</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Source system: ERP. Frequency: daily incremental load. Direction:
          ERP feeds into SIRE. Records are read-only in SIRE.
        </p>
      </div>
    </section>
  );
}

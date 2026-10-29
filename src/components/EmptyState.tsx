import type { Section } from "@/data/sections";

interface EmptyStateProps {
  section: Section;
}

export function EmptyState({ section }: EmptyStateProps) {
  const Icon = section.icon;

  return (
    <section aria-live="polite" className="mx-auto w-full max-w-3xl">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-teal-dark dark:text-teal">
        {section.label}
      </p>
      <h2 className="mb-4 text-[28px] font-semibold leading-tight">{section.heading}</h2>

      <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-card-foreground">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-teal-soft text-teal-dark dark:bg-teal/20 dark:text-teal"
        >
          <Icon className="h-[26px] w-[26px]" strokeWidth={1.8} />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{section.emptyTitle}</h3>
        <p className="mx-auto mb-0 max-w-[52ch] text-muted-foreground">{section.emptyText}</p>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Shell only — this section does not load real data yet.
      </p>
    </section>
  );
}

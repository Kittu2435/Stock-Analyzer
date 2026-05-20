import type { HorizonFilter } from "../types";

type HorizonFiltersProps = {
  activeFilter: HorizonFilter;
  filters: HorizonFilter[];
  onChange: (filter: HorizonFilter) => void;
};

export function HorizonFilters({
  activeFilter,
  filters,
  onChange,
}: HorizonFiltersProps) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <button
          className={
            activeFilter === filter
              ? "cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800"
              : "cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          }
          key={filter}
          onClick={() => onChange(filter)}
          type="button"
        >
          {filter === "All" ? "All horizons" : filter}
        </button>
      ))}
    </div>
  );
}

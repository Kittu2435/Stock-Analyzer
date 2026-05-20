import type { MarketFilter } from "../types";

type MarketFiltersProps = {
  activeFilter: MarketFilter;
  filters: MarketFilter[];
  onChange: (filter: MarketFilter) => void;
};

export function MarketFilters({
  activeFilter,
  filters,
  onChange,
}: MarketFiltersProps) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm font-medium">
      {filters.map((filter) => (
        <button
          className={
            activeFilter === filter
              ? "cursor-pointer rounded-md bg-slate-950 px-4 py-2 text-white"
              : "cursor-pointer px-4 py-2 text-slate-600"
          }
          key={filter}
          onClick={() => onChange(filter)}
          type="button"
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

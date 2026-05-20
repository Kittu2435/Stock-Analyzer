import type { Signal } from "../types";

type WatchlistPanelProps = {
  items: Signal[];
};

export function WatchlistPanel({ items }: WatchlistPanelProps) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div>
        <p className="text-sm font-medium text-slate-500">Research watchlist</p>
        <h2 className="mt-1 text-2xl font-semibold">
          {items.length} idea{items.length === 1 ? "" : "s"}
        </h2>
      </div>

      <div className="mt-4 grid gap-3">
        {items.length > 0 ? (
          items.map((item, index) => (
            <article
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              key={`${item.symbol}-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{item.symbol}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.broker} | {item.horizon}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Watch
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Trigger: {item.trigger} | Review: {item.reviewPlan}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm leading-6 text-slate-600">
            Add research ideas here after reading their brief.
          </div>
        )}
      </div>
    </div>
  );
}

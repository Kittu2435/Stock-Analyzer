import type { Signal } from "../types";
import { WatchlistPanel } from "./WatchlistPanel";

type ResearchRulesPanelProps = {
  watchlist: Signal[];
};

export function ResearchRulesPanel({ watchlist }: ResearchRulesPanelProps) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">Research rules</p>
      <h2 className="mt-1 text-2xl font-semibold">Evidence before action</h2>
      <dl className="mt-5 grid gap-3">
        <RuleMetric label="Minimum inputs" value="News + price + volume" />
        <RuleMetric label="Intraday rule" value="Must have same-day trigger" />
        <RuleMetric label="Hold rule" value="Needs fundamental support" />
        <RuleMetric label="F&O stance" value="Defined risk only" />
      </dl>

      <WatchlistPanel items={watchlist} />
    </aside>
  );
}

function RuleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

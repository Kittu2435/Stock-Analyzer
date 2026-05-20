import type { Signal } from "../types";

type SignalCardProps = {
  signal: Signal;
  onPreview: (signal: Signal) => void;
};

export function SignalCard({ signal, onPreview }: SignalCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold">{signal.symbol}</h3>
            <Badge tone="neutral">{signal.market}</Badge>
            <Badge tone="warning">{signal.horizon}</Badge>
            <Badge tone="info">{signal.broker}</Badge>
            <Badge
              tone={signal.dataSource === "alpha-vantage" ? "success" : "neutral"}
            >
              {signal.dataSource === "alpha-vantage" ? "Live news" : "Mock"}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {signal.reason}
          </p>
        </div>
        <div className="min-w-32 rounded-lg border border-slate-200 p-3 text-left sm:text-right">
          <p className="text-xs font-medium uppercase text-slate-500">
            Confidence
          </p>
          <p className="mt-1 text-2xl font-semibold">{signal.confidence}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <SignalMetric label="Price" value={signal.marketSnapshot.price} />
        <SignalMetric
          label="Change"
          value={signal.marketSnapshot.changePercent}
        />
        <SignalMetric label="Volume" value={signal.marketSnapshot.volume} />
        <SignalMetric label="Trend" value={signal.marketSnapshot.trend} />
      </dl>

      <dl className="mt-3 grid gap-3 sm:grid-cols-4">
        <SignalMetric label="Trigger" value={signal.trigger} />
        <SignalMetric label="Invalidation" value={signal.invalidation} />
        <SignalMetric label="Review plan" value={signal.reviewPlan} />
        <SignalMetric label="News score" value={`${signal.scores.news}/100`} />
      </dl>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-slate-900">{signal.recommendation}</p>
        <button
          className="cursor-pointer rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => onPreview(signal)}
          type="button"
        >
          Open research brief
        </button>
      </div>
    </article>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "warning" | "info" | "success";
}) {
  const toneClass = {
    neutral: "bg-slate-100 text-slate-700",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-blue-100 text-blue-800",
    success: "bg-emerald-100 text-emerald-800",
  }[tone];

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

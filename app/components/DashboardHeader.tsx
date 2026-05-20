type DashboardHeaderProps = {
  latestWatchSymbol?: string;
};

export function DashboardHeader({ latestWatchSymbol }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase text-blue-700">
          Research mode
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Stock Analyzer
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          A guided research assistant for India and US stocks. It combines
          news, price action, volume, fundamentals, and risk context before
          suggesting intraday or hold ideas.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {latestWatchSymbol
          ? `Latest watchlist idea: ${latestWatchSymbol}`
          : "Execution stays manual in Zerodha and INDmoney"}
      </div>
    </header>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeNseSymbol } from "./lib/nseSymbols";
import type { AgentPick, TradeSignal, TrendHeadline } from "./types";

type SignalResponse = {
  generatedAt: string;
  message?: string;
  provider: string;
  signalCount: number;
  signals: TradeSignal[];
  reconnectRequired?: boolean;
};

type ZerodhaStatus = {
  configured: boolean;
  connected?: boolean;
  reconnectRequired?: boolean;
  message?: string;
  missing?: string[];
};

type AgentResponse = {
  generatedAt: string;
  message?: string;
  picks: AgentPick[];
  sources: string[];
  latestNews?: TrendHeadline[];
};

type AgentMarket = "INDIA" | "US";

export default function Home() {
  const [symbolInput, setSymbolInput] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [generatedAt, setGeneratedAt] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<ZerodhaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentPicks, setAgentPicks] = useState<AgentPick[]>([]);
  const [agentMessage, setAgentMessage] = useState<string | undefined>();
  const [agentSources, setAgentSources] = useState<string[]>([]);
  const [agentGeneratedAt, setAgentGeneratedAt] = useState<string | undefined>();
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentMarket, setAgentMarket] = useState<AgentMarket>("INDIA");
  const [latestMarketNews, setLatestMarketNews] = useState<TrendHeadline[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const actionableCount = useMemo(
    () => signals.filter((signal) => signal.decision === "Actionable").length,
    [signals],
  );

  useEffect(() => {
    async function loadStatus() {
      const response = await fetch("/api/brokers/zerodha/status");
      const data = (await response.json()) as ZerodhaStatus;
      setStatus(data);
    }

    loadStatus().catch(() => {
      setStatus({ configured: false });
    });
  }, []);

  const scanSymbols = useCallback(async (nextSymbols: string[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (nextSymbols.length > 0) {
        params.set("symbols", nextSymbols.join(","));
      }

      const data = await fetchJsonWithRetry<SignalResponse>(
        nextSymbols.length > 0
          ? `/api/signals?${params.toString()}`
          : "/api/signals",
      );
      setSignals(data.signals);
      setMessage(data.message);
      setGeneratedAt(data.generatedAt);
      if (data.reconnectRequired) {
        setStatus((current) => ({
          configured: current?.configured ?? true,
          connected: false,
          reconnectRequired: true,
          message: data.message,
        }));
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to scan Zerodha quotes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      scanSymbols(symbols);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [scanSymbols, symbols]);

  function addSymbol() {
    const symbol = normalizeNseSymbol(symbolInput);

    if (!symbol) return;

    setSymbols((currentSymbols) =>
      currentSymbols.includes(symbol) ? currentSymbols : [...currentSymbols, symbol],
    );
    setSymbolInput("");
  }

  function removeSymbol(symbol: string) {
    setSymbols((currentSymbols) =>
      currentSymbols.filter((currentSymbol) => currentSymbol !== symbol),
    );
  }

  const runTrendAgent = useCallback(async () => {
    setIsAgentLoading(true);
    setAgentError(null);

    try {
      const data = await fetchJsonWithRetry<AgentResponse>(
        `/api/agent/trends?market=${encodeURIComponent(agentMarket)}`,
        1,
      );
      setAgentPicks(data.picks);
      setAgentMessage(data.message);
      setAgentSources(data.sources);
      setAgentGeneratedAt(data.generatedAt);
      setLatestMarketNews(data.latestNews ?? []);
    } catch (requestError) {
      setAgentError(
        requestError instanceof Error
          ? requestError.message
          : "Trend agent could not load current sources.",
      );
    } finally {
      setIsAgentLoading(false);
    }
  }, [agentMarket]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (agentMarket === "INDIA" && !status?.connected) return;

    const initialTimer = window.setTimeout(runTrendAgent, 500);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runTrendAgent();
      }
    }, 5 * 60 * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [agentMarket, autoRefresh, runTrendAgent, status?.connected]);

  function addDiscoveredSymbol(symbol: string) {
    setSymbols((currentSymbols) =>
      currentSymbols.includes(symbol) ? currentSymbols : [...currentSymbols, symbol],
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase text-blue-700">
            Zerodha India scanner
          </p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                Entry, exit, hold, intraday, and F&O filter
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Uses current news, historical trend, and live quote checks.
                Research only, with no automatic order placement.
              </p>
            </div>
            <div className="max-w-md text-left lg:text-right">
              <StatusPill status={status} />
              {status?.message ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {status.message}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              className="min-h-12 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
              onChange={(event) => setSymbolInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addSymbol();
              }}
              placeholder="Enter NSE symbol, e.g. TCS"
              value={symbolInput}
            />
            <button
              className="cursor-pointer rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              onClick={addSymbol}
              type="button"
            >
              Add and scan
            </button>
            <button
              className="cursor-pointer rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
              onClick={() => scanSymbols(symbols)}
              type="button"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {symbols.map((symbol) => (
              <button
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                key={symbol}
                onClick={() => removeSymbol(symbol)}
                type="button"
              >
                {symbol} x
              </button>
            ))}
            {symbols.length === 0 ? (
              <p className="text-sm text-slate-500">
                Add symbols or leave empty to scan Zerodha holdings/positions.
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Signals" value={`${signals.length}`} />
          <Metric label="Actionable" value={`${actionableCount}`} />
          <Metric label="Provider" value="Zerodha" />
          <Metric
            label="Updated"
            value={generatedAt ? new Date(generatedAt).toLocaleTimeString() : "--"}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-blue-700">
                Trend discovery agent
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                {agentMarket === "INDIA"
                  ? "India trend-backed picks"
                  : "US trend-backed picks"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {agentMarket === "INDIA"
                  ? "Maps current headlines to NSE instruments, checks Zerodha history and live quotes, then labels each idea as intraday, swing, long term, F&O, or no trade."
                  : "Uses Finnhub news and quotes plus company-specific coverage from Moneycontrol, CNBC, and MarketWatch, mapped with the official SEC ticker directory."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-1">
                {(["INDIA", "US"] as AgentMarket[]).map((market) => (
                  <button
                    className={`rounded-md px-4 py-2 text-sm font-semibold ${
                      agentMarket === market
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500"
                    }`}
                    key={market}
                    onClick={() => {
                      setAgentMarket(market);
                      setAgentPicks([]);
                      setAgentMessage(undefined);
                      setAgentSources([]);
                      setAgentGeneratedAt(undefined);
                      setAgentError(null);
                      setLatestMarketNews([]);
                    }}
                    type="button"
                  >
                    {market === "INDIA" ? "India" : "US"}
                  </button>
                ))}
              </div>
              <button
                className="cursor-pointer rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={isAgentLoading}
                onClick={runTrendAgent}
                type="button"
              >
                {isAgentLoading ? "Finding trends..." : "Run agent"}
              </button>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                <input
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                  type="checkbox"
                />
                Auto refresh 5m
              </label>
            </div>
          </div>

          {agentSources.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium uppercase text-slate-500">
              <p>Sources: {agentSources.join(", ")}</p>
              <p>
                Checked:{" "}
                {agentGeneratedAt
                  ? new Date(agentGeneratedAt).toLocaleString()
                  : "Not run"}
              </p>
              <p>
                News window:{" "}
                {agentGeneratedAt
                  ? formatNewsWindow(agentGeneratedAt)
                  : "Last 72 hours"}
              </p>
            </div>
          ) : null}

          {agentError ? (
            <StateCard title="Agent failed" body={agentError} tone="red" />
          ) : null}

          {!agentError && agentMessage ? (
            <StateCard title="Agent note" body={agentMessage} tone="amber" />
          ) : null}

          {latestMarketNews.length > 0 ? (
            <section className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Latest US market news</h3>
                <Badge>Newest first</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                News-only companies appear here when Finnhub has not yet
                provided a verified tradable US ticker and quote.
              </p>
              <div className="mt-3 grid gap-2">
                {latestMarketNews.map((headline) => (
                  <a
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700 hover:text-blue-700"
                    href={headline.link}
                    key={`latest-${headline.link}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="block text-xs font-semibold uppercase text-slate-500">
                      {headline.source} |{" "}
                      {formatHeadlineTimestamp(headline.publishedAt)}
                    </span>
                    <span className="mt-1 block text-sm font-medium">
                      {headline.title}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {agentPicks.length > 0 ? (
            <div className="mt-4 grid gap-4">
              {agentPicks.map((pick) => (
                <AgentPickCard
                  key={pick.symbol}
                  onAdd={agentMarket === "INDIA" ? addDiscoveredSymbol : undefined}
                  pick={pick}
                />
              ))}
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <StateCard title="Scanning Zerodha" body="Fetching live NSE quotes..." />
        ) : null}

        {error ? <StateCard title="Signal load failed" body={error} tone="red" /> : null}

        {!isLoading && !error && message ? (
          <StateCard title="Scanner note" body={message} tone="amber" />
        ) : null}

        <section className="grid gap-4">
          {signals.map((signal) => (
            <SignalCard key={signal.symbol} signal={signal} />
          ))}
        </section>
      </section>
    </main>
  );
}

function AgentPickCard({
  onAdd,
  pick,
}: {
  onAdd?: (symbol: string) => void;
  pick: AgentPick;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold">{pick.symbol}</h3>
            <Badge>{pick.verdict}</Badge>
            <Badge>Strategy: {pick.strategy.type}</Badge>
            <Badge>News: {pick.sentiment.label}</Badge>
            <Badge>
              History:{" "}
              {pick.history.status === "Available"
                ? pick.history.trend
                : "Unavailable"}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{pick.reason}</p>
        </div>
        {onAdd ? (
          <button
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => onAdd(pick.symbol)}
            type="button"
          >
            Add to scan
          </button>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Recommended for" value={pick.strategy.type} />
        <Info label="Holding period" value={pick.strategy.holdingPeriod} />
        <Info
          label="F&O eligibility"
          value={pick.strategy.fnoEligible ? "Confirmed in Zerodha NFO" : "Not confirmed"}
        />
        <Info label="Strategy basis" value={pick.strategy.reason} />
      </dl>

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info
          label={`Price (${pick.signal.exchange === "US" ? "USD" : "INR"})`}
          value={formatMoney(pick.signal.price)}
        />
        <Info label="Change" value={formatPercent(pick.signal.changePercent)} />
        <Info
          label="Coverage"
          value={`${pick.headlineCount} headlines / ${pick.sourceCount} sources`}
        />
        <Info
          label="Latest news published"
          value={formatHeadlineTimestamp(pick.latestPublishedAt)}
        />
      </dl>

      {pick.history.status === "Available" ? (
        <dl className="mt-3 grid gap-3 md:grid-cols-4">
          <Info
            label="News breakdown"
            value={`${pick.sentiment.positiveHeadlines} positive / ${pick.sentiment.negativeHeadlines} negative / ${pick.sentiment.neutralHeadlines} neutral`}
          />
          <Info label="20-session return" value={formatPercent(pick.history.return20d)} />
          <Info label="60-session return" value={formatPercent(pick.history.return60d)} />
          <Info
            label="60-session drawdown"
            value={formatPercent(pick.history.maxDrawdown60d)}
          />
        </dl>
      ) : (
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          <Info
            label="News breakdown"
            value={`${pick.sentiment.positiveHeadlines} positive / ${pick.sentiment.negativeHeadlines} negative / ${pick.sentiment.neutralHeadlines} neutral`}
          />
          <Info label="Historical indicators" value={pick.history.reason} />
        </dl>
      )}

      <dl
        className={`mt-3 grid gap-3 ${
          pick.history.status === "Available" ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <Info
          label="Sentiment evidence"
          value={
            pick.sentiment.evidence.length > 0
              ? pick.sentiment.evidence.join("; ")
              : "No explicit positive or negative financial event found"
          }
        />
        {pick.history.status === "Available" ? (
          <Info label="Historical assessment" value={pick.history.reason} />
        ) : null}
        {pick.history.status === "Available" ? (
          <Info
            label="Moving averages"
            value={formatMovingAverages(
              pick.history.aboveSma20,
              pick.history.aboveSma50,
            )}
          />
        ) : null}
      </dl>

      {pick.strategy.type === "No Trade" &&
      pick.signal.exchange !== "US" ? (
        <section className="mt-3 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-950">
            No entry scenario generated
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {pick.strategy.reason} Pullback, stop-loss and target calculations
            are hidden until the required confirmation data is available.
          </p>
        </section>
      ) : (
        <TradePlan
          provisional={pick.strategy.type === "No Trade"}
          signal={pick.signal}
        />
      )}

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Quote setup" value={pick.signal.tradeType} />
        <Info
          label="Provider quote as of"
          value={
            pick.signal.providerTimestamp
              ? new Date(pick.signal.providerTimestamp).toLocaleString()
              : "Provider timestamp unavailable"
          }
        />
        <Info label="Trend score" value={formatScore(pick.signal.scores.trend)} />
        <Info label="Risk score" value={formatScore(pick.signal.scores.risk)} />
      </dl>

      <div className="mt-3 grid gap-2">
        {pick.headlines.map((headline) => (
          <a
            className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 hover:text-blue-700"
            href={headline.link}
            key={`${pick.symbol}-${headline.link}`}
            rel="noreferrer"
            target="_blank"
          >
            <span className="block text-xs font-semibold uppercase text-slate-500">
              {headline.source} | {formatHeadlineTimestamp(headline.publishedAt)}
            </span>
            <span className="mt-1 block text-sm font-medium">{headline.title}</span>
          </a>
        ))}
      </div>
    </article>
  );
}

function SignalCard({ signal }: { signal: TradeSignal }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-semibold">{signal.symbol}</h2>
            <Badge>Quote setup: {signal.tradeType}</Badge>
            <Badge>{signal.decision}</Badge>
            <Badge>{signal.trend}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{signal.reason}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Confidence</p>
          <p className="mt-1 text-3xl font-semibold">{signal.confidence}%</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-4">
        <Info
          label={`Price (${signal.exchange === "US" ? "USD" : "INR"})`}
          value={formatMoney(signal.price)}
        />
        <Info label="Change" value={formatPercent(signal.changePercent)} />
        <Info label="Volume" value={formatNumber(signal.volume)} />
        <Info label="Source" value={signal.source} />
      </dl>

      <TradePlan signal={signal} />

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="F&O" value={signal.fnoPlan} />
        <Info label="Trend score" value={formatScore(signal.scores.trend)} />
        <Info label="Volume score" value={formatScore(signal.scores.volume)} />
        <Info label="Risk score" value={formatScore(signal.scores.risk)} />
      </dl>
    </article>
  );
}

function StatusPill({ status }: { status: ZerodhaStatus | null }) {
  if (!status) {
    return <span className="rounded-lg bg-slate-100 px-4 py-3 text-sm">Checking Zerodha</span>;
  }

  if (status.connected) {
    return (
      <span
        className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
      >
        Zerodha connected
      </span>
    );
  }

  return (
    <a
      className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white"
      href="/api/brokers/zerodha/login"
    >
      {status.reconnectRequired ? "Reconnect Zerodha" : "Connect Zerodha"}
    </a>
  );
}

function TradePlan({
  provisional = false,
  signal,
}: {
  provisional?: boolean;
  signal: TradeSignal;
}) {
  const plan = signal.entryPlan;
  const referenceEntry = getScenarioEntry(signal);

  return (
    <section className="mt-3 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-950">
          {provisional
            ? "Quote-only watch levels"
            : "Calculated trade scenario"}
        </p>
        <Badge>Preferred: {plan.preferred}</Badge>
      </div>
      <p className="mt-2 text-xs font-medium uppercase text-amber-700">
        {provisional
          ? "Not a buy signal. Historical confirmation is unavailable."
          : "Stock Analyzer calculation, not a Zerodha or Finnhub forecast"}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{plan.summary}</p>

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info
          label="Pullback zone"
          value={formatPriceZone(plan.pullbackLow, plan.pullbackHigh)}
        />
        <Info
          label="Breakout trigger"
          value={formatOptionalMoney(plan.breakoutTrigger)}
        />
        <Info label="Stop-loss" value={formatOptionalMoney(plan.stopLoss)} />
        <Info label="No chase above" value={formatOptionalMoney(plan.noChaseAbove)} />
      </dl>

      <dl className="mt-3 grid gap-3 md:grid-cols-3">
        <Info label="Targets" value={formatTargets(plan.targets)} />
        <Info label="Entry confirmation" value={plan.condition} />
        <Info label="Exit rule" value={signal.exitRule} />
      </dl>

      <dl className="mt-3 grid gap-3 md:grid-cols-4">
        <Info
          label="Scenario entry"
          value={formatOptionalMoney(referenceEntry)}
        />
        <Info
          label="Potential profit"
          value={formatTargetMargins(plan.targets, referenceEntry)}
        />
        <Info
          label="Risk to stop"
          value={formatRiskMargin(plan.stopLoss, referenceEntry)}
        />
        <Info
          label="Reward / risk"
          value={formatRewardRisk(
            plan.targets,
            plan.stopLoss,
            referenceEntry,
          )}
        />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}

function StateCard({
  body,
  title,
  tone = "slate",
}: {
  body: string;
  title: string;
  tone?: "amber" | "red" | "slate";
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-red-200 bg-red-50 text-red-950",
    slate: "border-slate-200 bg-white text-slate-700",
  }[tone];

  return (
    <section className={`rounded-lg border p-5 shadow-sm ${toneClass}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6">{body}</p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatNumber(value: number | null) {
  return value === null ? "Unavailable from provider" : value.toLocaleString("en-IN");
}

function formatPercent(value: number | null) {
  if (value === null) return "Unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatScore(value: number | null) {
  return value === null ? "Unavailable" : `${value}/100`;
}

function formatOptionalMoney(value: number | null) {
  return value === null ? "Wait for setup" : formatMoney(value);
}

function formatPriceZone(low: number | null, high: number | null) {
  if (low === null || high === null) return "Wait for setup";
  return `${formatMoney(low)} - ${formatMoney(high)}`;
}

function formatTargets(targets: number[]) {
  return targets.length > 0
    ? targets.map((target) => formatMoney(target)).join(" / ")
    : "Wait for setup";
}

function getScenarioEntry(signal: TradeSignal) {
  const plan = signal.entryPlan;

  if (
    plan.preferred === "Pullback" &&
    plan.pullbackLow !== null &&
    plan.pullbackHigh !== null
  ) {
    return (plan.pullbackLow + plan.pullbackHigh) / 2;
  }

  return plan.breakoutTrigger ?? signal.price;
}

function formatTargetMargins(targets: number[], entry: number | null) {
  if (entry === null || targets.length === 0) return "Unavailable";

  return targets
    .map((target, index) => {
      const percent = ((target - entry) / entry) * 100;
      const amount = target - entry;

      return `T${index + 1}: +${percent.toFixed(2)}% (+${formatMoney(amount)}/share)`;
    })
    .join(" | ");
}

function formatRiskMargin(stopLoss: number | null, entry: number | null) {
  if (entry === null || stopLoss === null) return "Unavailable";

  const percent = ((stopLoss - entry) / entry) * 100;
  const amount = stopLoss - entry;

  return `${percent.toFixed(2)}% (${formatMoney(amount)}/share)`;
}

function formatRewardRisk(
  targets: number[],
  stopLoss: number | null,
  entry: number | null,
) {
  if (entry === null || stopLoss === null || targets.length === 0) {
    return "Unavailable";
  }

  const risk = entry - stopLoss;
  if (risk <= 0) return "Unavailable";

  return targets
    .map((target, index) => {
      const reward = target - entry;
      return `T${index + 1}: 1:${Math.max(0, reward / risk).toFixed(2)}`;
    })
    .join(" | ");
}

function formatMovingAverages(
  aboveSma20: boolean | null,
  aboveSma50: boolean | null,
) {
  const sma20 =
    aboveSma20 === null
      ? "SMA20 unavailable"
      : `${aboveSma20 ? "Above" : "Below"} SMA20`;
  const sma50 =
    aboveSma50 === null
      ? "SMA50 unavailable"
      : `${aboveSma50 ? "Above" : "Below"} SMA50`;

  return `${sma20}; ${sma50}`;
}

function formatHeadlineAge(publishedAt: string | null) {
  if (!publishedAt) return "Unknown time";

  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(publishedAt).getTime()) / 60000),
  );

  if (ageMinutes < 60) return `${ageMinutes}m ago`;

  const ageHours = Math.floor(ageMinutes / 60);

  if (ageHours < 24) return `${ageHours}h ago`;

  return `${Math.floor(ageHours / 24)}d ago`;
}

function formatHeadlineTimestamp(publishedAt: string | null) {
  if (!publishedAt) return "Publication time unavailable";

  return `${new Date(publishedAt).toLocaleString()} (${formatHeadlineAge(
    publishedAt,
  )})`;
}

function formatNewsWindow(generatedAt: string) {
  const end = new Date(generatedAt);
  const start = new Date(end.getTime() - 72 * 60 * 60 * 1000);

  return `${start.toLocaleString()} to ${end.toLocaleString()}`;
}

async function fetchJsonWithRetry<T>(url: string, retries = 1): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json()) as T & {
        diagnostic?: string;
        message?: string;
      };

      if (!response.ok) {
        const detail =
          data.diagnostic && process.env.NODE_ENV === "development"
            ? ` ${data.diagnostic}`
            : "";

        throw new Error(
          `${data.message || `Request failed (${response.status}).`}${detail}`,
        );
      }

      return data;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Request could not be completed.");

      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }
  }

  throw lastError ?? new Error("Request could not be completed.");
}

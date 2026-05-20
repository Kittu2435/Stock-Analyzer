"use client";

import { useEffect, useState } from "react";
import type { ResearchBrief, Signal } from "../types";

type ResearchBriefModalProps = {
  signal: Signal;
  onClose: () => void;
  onAddToWatchlist: (signal: Signal) => void;
};

export function ResearchBriefModal({
  signal,
  onClose,
  onAddToWatchlist,
}: ResearchBriefModalProps) {
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState(true);
  const [briefError, setBriefError] = useState<string | null>(null);
  const overallScore = Math.round(
    Object.values(signal.scores).reduce((total, score) => total + score, 0) /
      Object.values(signal.scores).length,
  );

  // Flow step 2a: backend prepares a research brief before watchlist action.
  useEffect(() => {
    async function loadResearchBrief() {
      try {
        setIsLoadingBrief(true);
        setBriefError(null);

        const response = await fetch("/api/research/brief", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol: signal.symbol }),
        });

        if (!response.ok) {
          throw new Error("Unable to load research brief.");
        }

        const data: { brief: ResearchBrief } = await response.json();
        setBrief(data.brief);
      } catch {
        setBriefError("Research brief could not be loaded. Please try again.");
      } finally {
        setIsLoadingBrief(false);
      }
    }

    loadResearchBrief();
  }, [signal.symbol]);

  return (
    <div className="fixed inset-0 z-50 flex items-end overflow-y-auto bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
      <section
        aria-label="Research brief"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-blue-700">
              Research brief
            </p>
            <h2 className="mt-1 text-3xl font-semibold">{signal.symbol}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {signal.broker} | {signal.market} | {signal.horizon}
            </p>
          </div>
          <button
            aria-label="Close research brief"
            className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 text-slate-600"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          This app is a research assistant. Use it to shortlist ideas and
          understand why a stock may suit intraday or hold, then decide
          separately in Zerodha or INDmoney.
        </div>

        {isLoadingBrief ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            Building research brief from catalyst, technical, volume,
            fundamentals, and risk checks...
          </div>
        ) : null}

        {briefError ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">
            {briefError}
          </div>
        ) : null}

        {brief ? (
          <section className="mt-5 grid gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <BriefMetric label="Verdict" value={brief.verdict} />
              <BriefMetric label="Best suited for" value={brief.suitableFor} />
              <BriefMetric
                label="Overall score"
                value={`${overallScore}/100`}
              />
            </div>

            <section>
              <p className="text-sm font-semibold uppercase text-slate-500">
                Score breakdown
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                <ScorePill label="News" value={signal.scores.news} />
                <ScorePill label="Technical" value={signal.scores.technical} />
                <ScorePill label="Volume" value={signal.scores.volume} />
                <ScorePill
                  label="Fundamentals"
                  value={signal.scores.fundamentals}
                />
                <ScorePill label="Risk" value={signal.scores.risk} />
              </div>
            </section>

            <section>
              <p className="text-sm font-semibold uppercase text-slate-500">
                Market snapshot
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <BriefMetric label="Price" value={signal.marketSnapshot.price} />
                <BriefMetric
                  label="Change"
                  value={signal.marketSnapshot.changePercent}
                />
                <BriefMetric label="Volume" value={signal.marketSnapshot.volume} />
                <BriefMetric label="Trend" value={signal.marketSnapshot.trend} />
              </div>
            </section>

            <section className="grid gap-3">
              <ResearchPoint title="News catalyst" body={signal.newsCatalyst} />
              <ResearchPoint title="Technical view" body={signal.technicalView} />
              <ResearchPoint title="Volume view" body={signal.volumeView} />
              <ResearchPoint
                title="Fundamental fit"
                body={signal.fundamentalView}
              />
              <ResearchPoint title="Risk view" body={signal.riskView} />
              <ResearchPoint title="F&O view" body={signal.fnoView} />
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold uppercase text-slate-500">
                Latest news
              </p>
              {signal.latestNews && signal.latestNews.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {signal.latestNews.map((article) => (
                    <a
                      className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                      href={article.url}
                      key={article.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {article.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {article.source} | {article.publishedAt}
                        {article.sentiment ? ` | ${article.sentiment}` : ""}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No live article is attached yet. Add an Alpha Vantage key to
                  enable live news enrichment.
                </p>
              )}
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <BriefMetric label="Trigger" value={signal.trigger} />
              <BriefMetric label="Invalidation" value={signal.invalidation} />
              <BriefMetric label="Review plan" value={signal.reviewPlan} />
            </section>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Warnings</p>
              <ul className="mt-2 grid gap-1 text-sm leading-6 text-amber-900">
                {brief.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          </section>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            className="cursor-pointer rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 sm:flex-1"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-1"
            disabled={isLoadingBrief || Boolean(briefError) || !brief}
            onClick={() => onAddToWatchlist(signal)}
            type="button"
          >
            Add to watchlist
          </button>
        </div>
      </section>
    </div>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function ResearchPoint({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

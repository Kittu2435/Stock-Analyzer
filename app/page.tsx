"use client";

import { useEffect, useMemo, useState } from "react";
import { brokerStatuses, horizonFilters, marketFilters } from "./data";
import { BrokerStatusCards } from "./components/BrokerStatusCards";
import { DashboardHeader } from "./components/DashboardHeader";
import { ResearchBriefModal } from "./components/ResearchBriefModal";
import { ResearchRulesPanel } from "./components/ResearchRulesPanel";
import { SignalQueue } from "./components/SignalQueue";
import { UniverseManager } from "./components/UniverseManager";
import type { HorizonFilter, MarketFilter, Signal } from "./types";

const watchlistStorageKey = "stock-analyzer-watchlist";
const universeStorageKey = "stock-analyzer-universe";

export default function Home() {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("All");
  const [horizonFilter, setHorizonFilter] = useState<HorizonFilter>("All");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [customSymbols, setCustomSymbols] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const savedUniverse = window.localStorage.getItem(universeStorageKey);

    if (!savedUniverse) {
      return [];
    }

    try {
      return JSON.parse(savedUniverse) as string[];
    } catch {
      window.localStorage.removeItem(universeStorageKey);
      return [];
    }
  });
  const [watchlist, setWatchlist] = useState<Signal[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const savedWatchlist = window.localStorage.getItem(watchlistStorageKey);

    if (!savedWatchlist) {
      return [];
    }

    try {
      return JSON.parse(savedWatchlist) as Signal[];
    } catch {
      window.localStorage.removeItem(watchlistStorageKey);
      return [];
    }
  });

  // Flow step 4: keep the local watchlist across refreshes.
  useEffect(() => {
    window.localStorage.setItem(
      watchlistStorageKey,
      JSON.stringify(watchlist),
    );
  }, [watchlist]);

  // Flow step 0a: keep custom research universe across refreshes.
  useEffect(() => {
    window.localStorage.setItem(
      universeStorageKey,
      JSON.stringify(customSymbols),
    );
  }, [customSymbols]);

  // Flow step 0: load recommendations from backend, including custom symbols.
  useEffect(() => {
    async function loadSignals() {
      try {
        setIsLoadingSignals(true);
        setSignalsError(null);

        const params = new URLSearchParams();

        if (customSymbols.length > 0) {
          params.set("symbols", customSymbols.join(","));
        }

        const response = await fetch(
          params.size > 0 ? `/api/signals?${params.toString()}` : "/api/signals",
        );

        if (!response.ok) {
          throw new Error("Unable to load signals.");
        }

        const data: { signals: Signal[] } = await response.json();
        setSignals(data.signals);
      } catch {
        setSignalsError("Signals could not be loaded. Please refresh.");
      } finally {
        setIsLoadingSignals(false);
      }
    }

    loadSignals();
  }, [customSymbols]);

  // Flow step 1: user filters the signal queue by market and holding period.
  const filteredSignals = useMemo(() => {
    return signals.filter((signal) => {
      const marketMatches =
        marketFilter === "All" || signal.market === marketFilter;
      const horizonMatches =
        horizonFilter === "All" || signal.horizon === horizonFilter;

      return marketMatches && horizonMatches;
    });
  }, [horizonFilter, marketFilter, signals]);

  // Flow step 3: after reading the brief, the idea can be tracked in watchlist.
  function addToWatchlist(signal: Signal) {
    setWatchlist((currentItems) => {
      const withoutDuplicate = currentItems.filter(
        (item) => item.symbol !== signal.symbol,
      );

      return [signal, ...withoutDuplicate];
    });
    setSelectedSignal(null);
  }

  function addCustomSymbol(symbol: string) {
    const normalizedSymbol = symbol.trim().toUpperCase().replace(/\s+/g, "");

    if (!normalizedSymbol) {
      return;
    }

    setCustomSymbols((currentSymbols) => {
      const withoutDuplicate = currentSymbols.filter(
        (item) => item !== normalizedSymbol,
      );

      return [normalizedSymbol, ...withoutDuplicate];
    });
  }

  function removeCustomSymbol(symbol: string) {
    setCustomSymbols((currentSymbols) =>
      currentSymbols.filter((item) => item !== symbol),
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <DashboardHeader latestWatchSymbol={watchlist[0]?.symbol} />

        {watchlist[0] ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase">
                  Added to watchlist
                </p>
                <p className="mt-1 text-sm leading-6">
                  {watchlist[0].symbol} was added as a research idea for{" "}
                  {watchlist[0].broker}. Trigger: {watchlist[0].trigger}.
                </p>
              </div>
              <button
                className="cursor-pointer rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold"
                onClick={() => setWatchlist([])}
                type="button"
              >
                Clear watchlist
              </button>
            </div>
          </section>
        ) : null}

        <BrokerStatusCards brokers={brokerStatuses} />

        <UniverseManager
          symbols={customSymbols}
          onAddSymbol={addCustomSymbol}
          onRemoveSymbol={removeCustomSymbol}
        />

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <SignalQueue
            horizonFilter={horizonFilter}
            horizonFilters={horizonFilters}
            marketFilter={marketFilter}
            marketFilters={marketFilters}
            signals={filteredSignals}
            isLoading={isLoadingSignals}
            error={signalsError}
            onHorizonChange={setHorizonFilter}
            onMarketChange={setMarketFilter}
            // Flow step 2: user opens a research brief before tracking an idea.
            onPreviewSignal={setSelectedSignal}
          />

          <ResearchRulesPanel watchlist={watchlist} />
        </section>
      </section>

      {selectedSignal ? (
        <ResearchBriefModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
          onAddToWatchlist={addToWatchlist}
        />
      ) : null}
    </main>
  );
}

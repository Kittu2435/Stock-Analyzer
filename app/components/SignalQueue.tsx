import type { HorizonFilter, MarketFilter, Signal } from "../types";
import { HorizonFilters } from "./HorizonFilters";
import { MarketFilters } from "./MarketFilters";
import { SignalCard } from "./SignalCard";

type SignalQueueProps = {
  horizonFilter: HorizonFilter;
  horizonFilters: HorizonFilter[];
  marketFilter: MarketFilter;
  marketFilters: MarketFilter[];
  signals: Signal[];
  isLoading: boolean;
  error: string | null;
  onHorizonChange: (filter: HorizonFilter) => void;
  onMarketChange: (filter: MarketFilter) => void;
  onPreviewSignal: (signal: Signal) => void;
};

export function SignalQueue({
  horizonFilter,
  horizonFilters,
  marketFilter,
  marketFilters,
  signals,
  isLoading,
  error,
  onHorizonChange,
  onMarketChange,
  onPreviewSignal,
}: SignalQueueProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Market overview</p>
          <h2 className="mt-1 text-2xl font-semibold">
            Today&apos;s research queue
          </h2>
        </div>
        <MarketFilters
          activeFilter={marketFilter}
          filters={marketFilters}
          onChange={onMarketChange}
        />
      </div>

      <HorizonFilters
        activeFilter={horizonFilter}
        filters={horizonFilters}
        onChange={onHorizonChange}
      />

      <div className="mt-5 grid gap-4">
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <h3 className="text-lg font-semibold">Loading signals</h3>
            <p className="mt-2 text-sm text-slate-600">
              Pulling research signals from the backend route.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-900">
            <h3 className="text-lg font-semibold">Signal load failed</h3>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : null}

        {!isLoading && !error ? signals.map((signal) => (
          <SignalCard
            key={signal.symbol}
            signal={signal}
            onPreview={onPreviewSignal}
          />
        )) : null}

        {!isLoading && !error && signals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <h3 className="text-lg font-semibold">No signals found</h3>
            <p className="mt-2 text-sm text-slate-600">
              Try changing the market or horizon filter.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

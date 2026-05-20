"use client";

import { useState } from "react";

type UniverseManagerProps = {
  symbols: string[];
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
};

export function UniverseManager({
  symbols,
  onAddSymbol,
  onRemoveSymbol,
}: UniverseManagerProps) {
  const [symbolInput, setSymbolInput] = useState("");

  function addSymbol() {
    if (!symbolInput.trim()) {
      return;
    }

    onAddSymbol(symbolInput);
    setSymbolInput("");
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">My universe</p>
          <h2 className="mt-1 text-2xl font-semibold">
            Add stocks you want researched
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Add symbols like TCS, INFY, MSFT, TSLA. Indian symbols are mapped to
            Zerodha context, and US symbols are mapped to INDmoney context.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
            onChange={(event) => setSymbolInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                addSymbol();
              }
            }}
            placeholder="Enter symbol"
            value={symbolInput}
          />
          <button
            className="cursor-pointer rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            onClick={addSymbol}
            type="button"
          >
            Add symbol
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {symbols.length > 0 ? (
          symbols.map((symbol) => (
            <button
              className="cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
              key={symbol}
              onClick={() => onRemoveSymbol(symbol)}
              title="Remove from universe"
              type="button"
            >
              {symbol} x
            </button>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            No custom symbols yet. The default research queue is still active.
          </p>
        )}
      </div>
    </section>
  );
}

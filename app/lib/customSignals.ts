import type { Signal } from "../types";

const commonIndiaSymbols = new Set([
  "ADANIENT",
  "AXISBANK",
  "BAJFINANCE",
  "HCLTECH",
  "ICICIBANK",
  "INFY",
  "ITC",
  "KOTAKBANK",
  "LT",
  "SBIN",
  "TCS",
  "TATAMOTORS",
  "WIPRO",
]);

export function createCustomSignals(symbols: string[]) {
  return symbols
    .map((symbol) => normalizeSymbol(symbol))
    .filter(Boolean)
    .map((symbol) => createCustomSignal(symbol));
}

export function createCustomSignal(symbol: string): Signal {
  const normalizedSymbol = normalizeSymbol(symbol);
  const market = inferMarket(normalizedSymbol);
  const broker = market === "India" ? "Zerodha" : "INDmoney";

  return {
    symbol: normalizedSymbol,
    market,
    horizon: "Hold",
    confidence: "50%",
    recommendation: "Watch",
    broker,
    trigger: "Wait for news catalyst and price confirmation",
    invalidation: "Avoid if trend turns weak or risk score drops",
    reviewPlan: "Review after latest news, price move, and volume are updated",
    reason:
      "Custom universe item. The app will enrich this with news and market data when API access is available.",
    newsCatalyst: "Waiting for fresh company or sector news.",
    technicalView: "Needs trend confirmation before becoming actionable.",
    volumeView: "Needs volume confirmation before intraday consideration.",
    fundamentalView:
      market === "India"
        ? "Use Zerodha/India context and fundamentals before holding."
        : "Use INDmoney/US context and fundamentals before holding.",
    riskView: "Neutral until live market context is available.",
    fnoView:
      market === "India"
        ? "F&O may be possible if this symbol has derivatives liquidity. Treat as high risk."
        : "US F&O is not integrated through INDmoney in this app.",
    scores: {
      news: 50,
      technical: 50,
      volume: 50,
      fundamentals: 50,
      risk: 55,
    },
    marketSnapshot: {
      price: "Pending",
      changePercent: "Pending",
      volume: "Pending",
      trend: "Neutral",
    },
  };
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function inferMarket(symbol: string): Signal["market"] {
  if (
    symbol.endsWith(".NS") ||
    symbol.endsWith(".BSE") ||
    commonIndiaSymbols.has(symbol)
  ) {
    return "India";
  }

  return "US";
}

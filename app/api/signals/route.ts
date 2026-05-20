import { NextRequest, NextResponse } from "next/server";
import { signals } from "../../data";
import { enrichSignalsWithAlphaVantageMarketData } from "../../lib/alphaVantageMarket";
import { enrichSignalsWithAlphaVantageNews } from "../../lib/alphaVantageNews";
import { createCustomSignals } from "../../lib/customSignals";
import { applyRecommendationEngine } from "../../lib/recommendationEngine";

export async function GET(request: NextRequest) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const generatedAt = new Date().toISOString();
  const customSymbols = request.nextUrl.searchParams
    .get("symbols")
    ?.split(",")
    .filter(Boolean);
  const customSignals = createCustomSignals(customSymbols ?? []);
  const signalUniverse = mergeSignals(signals, customSignals);

  if (!apiKey) {
    return NextResponse.json({
      generatedAt,
      provider: "mock",
      message:
        "Set ALPHA_VANTAGE_API_KEY in .env.local to enable live news and market snapshots.",
      signals: applyRecommendationEngine(
        signalUniverse.map((signal) => ({
          ...signal,
          dataSource: "mock",
          latestNews: [],
          lastUpdated: generatedAt,
        })),
      ),
    });
  }

  const newsEnrichedSignals = await enrichSignalsWithAlphaVantageNews(
    signalUniverse,
    apiKey,
  );
  const enrichedSignals = await enrichSignalsWithAlphaVantageMarketData(
    newsEnrichedSignals,
    apiKey,
  );

  return NextResponse.json({
    generatedAt,
    provider: "alpha-vantage",
    signals: applyRecommendationEngine(enrichedSignals),
  });
}

function mergeSignals(defaultSignals: typeof signals, customSignals: typeof signals) {
  const bySymbol = new Map<string, (typeof signals)[number]>();

  [...defaultSignals, ...customSignals].forEach((signal) => {
    bySymbol.set(signal.symbol, signal);
  });

  return Array.from(bySymbol.values());
}

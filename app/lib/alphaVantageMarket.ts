import type { MarketSnapshot, Signal } from "../types";

type AlphaVantageQuoteResponse = {
  "Global Quote"?: {
    "05. price"?: string;
    "09. change"?: string;
    "10. change percent"?: string;
    "06. volume"?: string;
  };
  Information?: string;
  Note?: string;
};

const alphaVantageTickerMap: Record<string, string> = {
  AAPL: "AAPL",
  INFY: "INFY",
  NVDA: "NVDA",
  MSFT: "MSFT",
  TCS: "TCS.BSE",
  TSLA: "TSLA",
  HDFCBANK: "HDB",
  RELIANCE: "RELIANCE.BSE",
};

export async function enrichSignalsWithAlphaVantageMarketData(
  signals: Signal[],
  apiKey: string,
) {
  const enrichedSignals = await Promise.all(
    signals.map(async (signal) => {
      const marketSnapshot = await fetchAlphaVantageQuote(
        signal.symbol,
        apiKey,
      );

      if (!marketSnapshot) {
        return signal;
      }

      return {
        ...signal,
        marketSnapshot,
        scores: {
          ...signal.scores,
          technical: adjustTechnicalScore(
            signal.scores.technical,
            marketSnapshot.trend,
          ),
          volume: adjustVolumeScore(signal.scores.volume, marketSnapshot.volume),
          risk: adjustRiskScore(signal.scores.risk, marketSnapshot.changePercent),
        },
      };
    }),
  );

  return enrichedSignals;
}

async function fetchAlphaVantageQuote(
  symbol: string,
  apiKey: string,
): Promise<MarketSnapshot | null> {
  const ticker = alphaVantageTickerMap[symbol] ?? symbol;
  const url = new URL("https://www.alphavantage.co/query");

  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as AlphaVantageQuoteResponse;
  const quote = data["Global Quote"];

  if (!quote || data.Information || data.Note) {
    return null;
  }

  const changePercent = quote["10. change percent"] ?? "0%";

  return {
    price: formatNumber(quote["05. price"]),
    changePercent,
    volume: formatVolume(quote["06. volume"]),
    trend: getTrend(changePercent),
  };
}

function getTrend(changePercent: string): MarketSnapshot["trend"] {
  const numericChange = Number.parseFloat(changePercent.replace("%", ""));

  if (numericChange >= 1) {
    return "Strong";
  }

  if (numericChange <= -1) {
    return "Weak";
  }

  return "Neutral";
}

function adjustTechnicalScore(
  currentScore: number,
  trend: MarketSnapshot["trend"],
) {
  if (trend === "Strong") {
    return Math.min(currentScore + 7, 100);
  }

  if (trend === "Weak") {
    return Math.max(currentScore - 8, 0);
  }

  return currentScore;
}

function adjustVolumeScore(currentScore: number, volume: string) {
  const numericVolume = Number.parseInt(volume.replaceAll(",", ""), 10);

  if (Number.isNaN(numericVolume)) {
    return currentScore;
  }

  if (numericVolume > 10_000_000) {
    return Math.min(currentScore + 5, 100);
  }

  return currentScore;
}

function adjustRiskScore(currentScore: number, changePercent: string) {
  const numericChange = Math.abs(Number.parseFloat(changePercent.replace("%", "")));

  if (numericChange >= 4) {
    return Math.max(currentScore - 10, 0);
  }

  return currentScore;
}

function formatNumber(value?: string) {
  const numericValue = Number.parseFloat(value ?? "");

  if (Number.isNaN(numericValue)) {
    return "Pending";
  }

  return numericValue.toFixed(2);
}

function formatVolume(value?: string) {
  const numericValue = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(numericValue)) {
    return "Pending";
  }

  return numericValue.toLocaleString("en-US");
}

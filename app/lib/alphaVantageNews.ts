import type { NewsArticle, Signal } from "../types";

type AlphaVantageNewsItem = {
  title?: string;
  url?: string;
  source?: string;
  time_published?: string;
  overall_sentiment_label?: string;
};

type AlphaVantageNewsResponse = {
  feed?: AlphaVantageNewsItem[];
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

export async function enrichSignalsWithAlphaVantageNews(
  signals: Signal[],
  apiKey: string,
) {
  const enrichedSignals = await Promise.all(
    signals.map(async (signal) => {
      const latestNews = await fetchAlphaVantageNews(signal.symbol, apiKey);

      if (latestNews.length === 0) {
        return {
          ...signal,
          dataSource: "mock" as const,
          latestNews,
          lastUpdated: new Date().toISOString(),
        };
      }

      return {
        ...signal,
        dataSource: "alpha-vantage" as const,
        latestNews,
        lastUpdated: new Date().toISOString(),
        newsCatalyst: latestNews[0].title,
        scores: {
          ...signal.scores,
          news: adjustNewsScore(signal.scores.news, latestNews[0].sentiment),
        },
      };
    }),
  );

  return enrichedSignals;
}

async function fetchAlphaVantageNews(symbol: string, apiKey: string) {
  const ticker = alphaVantageTickerMap[symbol] ?? symbol;
  const url = new URL("https://www.alphavantage.co/query");

  url.searchParams.set("function", "NEWS_SENTIMENT");
  url.searchParams.set("tickers", ticker);
  url.searchParams.set("sort", "LATEST");
  url.searchParams.set("limit", "3");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as AlphaVantageNewsResponse;

  if (!data.feed || data.Information || data.Note) {
    return [];
  }

  return data.feed
    .filter((item) => item.title && item.url)
    .slice(0, 3)
    .map<NewsArticle>((item) => ({
      title: item.title ?? "Untitled news",
      source: item.source ?? "Unknown source",
      url: item.url ?? "#",
      publishedAt: formatAlphaVantageDate(item.time_published),
      sentiment: item.overall_sentiment_label,
    }));
}

function adjustNewsScore(currentScore: number, sentiment?: string) {
  if (sentiment === "Bullish" || sentiment === "Somewhat-Bullish") {
    return Math.min(currentScore + 8, 100);
  }

  if (sentiment === "Bearish" || sentiment === "Somewhat-Bearish") {
    return Math.max(currentScore - 10, 0);
  }

  return currentScore;
}

function formatAlphaVantageDate(value?: string) {
  if (!value || value.length < 8) {
    return "Unknown time";
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(9, 11) || "00";
  const minute = value.slice(11, 13) || "00";

  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

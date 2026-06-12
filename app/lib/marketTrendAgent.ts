import type { AgentPick, TrendHeadline } from "../types";
import { analyzeNewsSentiment } from "./financialSentiment";
import {
  analyzeHistoricalTrend,
  type DailyCandle,
  unavailableHistory,
} from "./historicalTrend";
import { normalizeNseSymbol } from "./nseSymbols";
import { recommendStrategy } from "./strategyRecommendation";
import {
  fetchZerodhaDailyCandles,
  fetchZerodhaInstruments,
  fetchZerodhaQuotes,
} from "./zerodha";
import { buildZerodhaSignals, type KiteQuote } from "./zerodhaSignalEngine";

type Instrument = {
  instrumentToken: string;
  tradingsymbol: string;
  name: string;
};

type SymbolMention = {
  instrument: Instrument;
  headlines: TrendHeadline[];
  sourceCount: number;
  strongestMatch: number;
};

type NewsBatch = {
  headlines: TrendHeadline[];
  sources: string[];
};

const maxNewsAgeHours = 72;

const rssSources = [
  {
    name: "LiveMint Markets",
    url: "https://www.livemint.com/rss/markets",
  },
  {
    name: "Economic Times Markets",
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  },
  {
    name: "Economic Times Stocks",
    url: "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  },
  {
    name: "Moneycontrol Market Reports",
    url: "https://www.moneycontrol.com/rss/marketreports.xml",
  },
  {
    name: "LiveMint Companies",
    url: "https://www.livemint.com/rss/companies",
  },
];

const ignoredNameTokens = new Set([
  "AND",
  "BANK",
  "COMPANY",
  "CORPORATION",
  "FINANCE",
  "INDIA",
  "INDIAN",
  "INDUSTRIES",
  "LIMITED",
  "LTD",
  "SERVICES",
]);

export async function runMarketTrendAgent(accessToken: string) {
  const [newsBatch, instrumentsResult, nfoInstrumentsResult] = await Promise.all([
    fetchMarketHeadlines(),
    fetchZerodhaInstruments(accessToken, "NSE"),
    fetchZerodhaInstruments(accessToken, "NFO"),
  ]);

  if (
    typeof instrumentsResult.data !== "string" ||
    !instrumentsResult.data.trim()
  ) {
    return {
      picks: [],
      generatedAt: new Date().toISOString(),
      message: instrumentsResult.message,
      sources: newsBatch.sources,
      reconnectRequired: instrumentsResult.reconnectRequired ?? false,
    };
  }

  const instruments = parseNseEquityInstruments(instrumentsResult.data);
  const nfoUnderlyingNames =
    typeof nfoInstrumentsResult.data === "string"
      ? parseNfoUnderlyingNames(nfoInstrumentsResult.data)
      : new Set<string>();
  const mentions = findSymbolMentions(newsBatch.headlines, instruments).slice(0, 12);

  if (mentions.length === 0) {
    return {
      picks: [],
      generatedAt: new Date().toISOString(),
      message: "No NSE stocks were confidently matched from news published in the last 72 hours.",
      sources: newsBatch.sources,
    };
  }

  const quoteResult = await fetchZerodhaQuotes(
    mentions.map((mention) => `NSE:${mention.instrument.tradingsymbol}`),
    accessToken,
  );
  const signals = buildZerodhaSignals(getQuotePayload(quoteResult.data));
  const signalBySymbol = new Map(signals.map((signal) => [signal.symbol, signal]));
  const candidates = mentions
    .map((mention) => {
      const signal = signalBySymbol.get(mention.instrument.tradingsymbol);

      if (!signal) return null;

      return {
        mention,
        signal,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        mention: SymbolMention;
        signal: NonNullable<typeof candidate>["signal"];
      } => Boolean(candidate),
    )
    .slice(0, 8);
  const picks: AgentPick[] = [];

  for (const candidate of candidates) {
    const { mention, signal } = candidate;
    const latestPublishedAt = getLatestPublishedAt(mention.headlines);
    const sentiment = analyzeNewsSentiment(mention.headlines);
    const history = await loadHistoricalAnalysis(
      mention.instrument.instrumentToken,
      accessToken,
    );
    const verdict = getAgentVerdict(sentiment.label, history, signal.decision);
    const strategy = recommendStrategy({
      verdict,
      sentiment,
      history,
      signal,
      latestPublishedAt,
      fnoEligible: isFnoEligible(mention.instrument, nfoUnderlyingNames),
    });

    picks.push({
      symbol: mention.instrument.tradingsymbol,
      sourceCount: mention.sourceCount,
      headlineCount: mention.headlines.length,
      latestPublishedAt,
      verdict,
      strategy,
      sentiment,
      history,
      reason: getAgentReason(mention, latestPublishedAt, verdict),
      signal,
      headlines: sortHeadlinesNewestFirst(mention.headlines).slice(0, 3),
    });

    await wait(350);
  }

  picks.sort(compareAgentPicks);

  return {
    picks,
    generatedAt: new Date().toISOString(),
    message:
      picks.length > 0
        ? undefined
        : quoteResult.message || "No live quote-backed picks could be ranked.",
    sources: newsBatch.sources,
    reconnectRequired:
      quoteResult.reconnectRequired ??
      nfoInstrumentsResult.reconnectRequired ??
      false,
  };
}

async function fetchMarketHeadlines(): Promise<NewsBatch> {
  const responses = await Promise.allSettled(
    rssSources.map(async (source) => {
      const response = await fetch(source.url, {
        cache: "no-store",
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, text/html",
        },
      });

      if (!response.ok) {
        return { headlines: [], source: null };
      }

      const headlines = parseRss(await response.text(), source.name);

      return {
        headlines,
        source: headlines.length > 0 ? source.name : null,
      };
    }),
  );
  const batches = responses.flatMap((response) =>
    response.status === "fulfilled" ? [response.value] : [],
  );

  return {
    headlines: batches.flatMap((batch) => batch.headlines),
    sources: batches.flatMap((batch) => (batch.source ? [batch.source] : [])),
  };
}

function parseRss(xml: string, source: string): TrendHeadline[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => {
      const item = match[0];
      const title = getXmlValue(item, "title");
      const link = getXmlValue(item, "link");
      const publishedAt = getXmlValue(item, "pubDate") || getXmlValue(item, "dc:date");

      if (!title || !link) return null;

      return {
        title,
        link,
        source,
        publishedAt: parsePublishedAt(publishedAt),
      };
    })
    .filter((headline): headline is TrendHeadline => Boolean(headline))
    .filter((headline) => isRecentHeadline(headline.publishedAt))
    .slice(0, 30);
}

function findSymbolMentions(
  headlines: TrendHeadline[],
  instruments: Instrument[],
): SymbolMention[] {
  const mentions = new Map<string, SymbolMention>();

  for (const headline of headlines) {
    const normalizedHeadline = normalizeText(headline.title);

    for (const instrument of instruments) {
      const matchScore = getInstrumentMatchScore(instrument, normalizedHeadline);

      if (matchScore < 5) continue;

      const current = mentions.get(instrument.tradingsymbol) ?? {
        instrument,
        headlines: [],
        sourceCount: 0,
        strongestMatch: 0,
      };

      if (!current.headlines.some((item) => item.link === headline.link)) {
        current.headlines.push(headline);
      }

      current.sourceCount = new Set(
        current.headlines.map((item) => item.source),
      ).size;
      current.strongestMatch = Math.max(current.strongestMatch, matchScore);
      mentions.set(instrument.tradingsymbol, current);
    }
  }

  return [...mentions.values()].sort((first, second) => {
    if (second.sourceCount !== first.sourceCount) {
      return second.sourceCount - first.sourceCount;
    }

    if (second.strongestMatch !== first.strongestMatch) {
      return second.strongestMatch - first.strongestMatch;
    }

    return (
      new Date(getLatestPublishedAt(second.headlines)).getTime() -
      new Date(getLatestPublishedAt(first.headlines)).getTime()
    );
  });
}

function getInstrumentMatchScore(instrument: Instrument, normalizedHeadline: string) {
  const symbol = normalizeText(instrument.tradingsymbol);
  const name = normalizeText(instrument.name);
  let score = 0;

  if (hasWord(normalizedHeadline, symbol)) {
    score += 8;
  }

  if (name.length >= 5 && normalizedHeadline.includes(name)) {
    score += 12;
  }

  const tokens = name
    .split(" ")
    .filter((token) => token.length >= 4 && !ignoredNameTokens.has(token));
  const matchedTokens = tokens.filter((token) => hasWord(normalizedHeadline, token));

  if (tokens.length > 0 && matchedTokens.length >= Math.min(2, tokens.length)) {
    score += matchedTokens.length * 3;
  }

  if (tokens.length === 1 && matchedTokens.length === 1 && tokens[0].length >= 6) {
    score += 5;
  }

  return score;
}

function compareAgentPicks(first: AgentPick, second: AgentPick) {
  const recencyDifference =
    new Date(second.latestPublishedAt).getTime() -
    new Date(first.latestPublishedAt).getTime();

  if (recencyDifference !== 0) return recencyDifference;

  const verdictRank = {
    Consider: 3,
    Watch: 2,
    Avoid: 1,
  };
  const verdictDifference =
    verdictRank[second.verdict] - verdictRank[first.verdict];

  if (verdictDifference !== 0) return verdictDifference;

  const decisionRank = {
    Actionable: 3,
    Watch: 2,
    Avoid: 1,
  };
  const decisionDifference =
    decisionRank[second.signal.decision] - decisionRank[first.signal.decision];

  if (decisionDifference !== 0) return decisionDifference;
  if (second.sourceCount !== first.sourceCount) {
    return second.sourceCount - first.sourceCount;
  }

  return second.signal.confidence - first.signal.confidence;
}

function getAgentReason(
  mention: SymbolMention,
  latestPublishedAt: string,
  verdict: AgentPick["verdict"],
) {
  const sources = [...new Set(mention.headlines.map((headline) => headline.source))];

  return `${verdict}: ${mention.instrument.name} appears in ${mention.headlines.length} recent headline${mention.headlines.length === 1 ? "" : "s"} from ${sources.length} independent source${sources.length === 1 ? "" : "s"}. Latest coverage: ${formatAge(latestPublishedAt)}.`;
}

function getLatestPublishedAt(headlines: TrendHeadline[]) {
  return headlines.reduce((latest, headline) => {
    if (!headline.publishedAt) return latest;
    return new Date(headline.publishedAt) > new Date(latest)
      ? headline.publishedAt
      : latest;
  }, headlines[0]?.publishedAt ?? new Date(0).toISOString());
}

function sortHeadlinesNewestFirst(headlines: TrendHeadline[]) {
  return [...headlines].sort(
    (first, second) =>
      new Date(second.publishedAt ?? 0).getTime() -
      new Date(first.publishedAt ?? 0).getTime(),
  );
}

function formatAge(publishedAt: string) {
  const ageHours = Math.max(
    0,
    Math.floor((Date.now() - new Date(publishedAt).getTime()) / 36e5),
  );

  if (ageHours < 1) return "less than an hour ago";
  if (ageHours < 24) return `${ageHours} hours ago`;

  return `${Math.floor(ageHours / 24)} days ago`;
}

function isRecentHeadline(publishedAt: string | null) {
  if (!publishedAt) return false;

  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 36e5;

  return ageHours >= 0 && ageHours <= maxNewsAgeHours;
}

function parsePublishedAt(value?: string) {
  if (!value) return null;

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function getQuotePayload(data: unknown): Record<string, KiteQuote> {
  if (
    data &&
    typeof data === "object" &&
    "data" in data &&
    data.data &&
    typeof data.data === "object"
  ) {
    return data.data as Record<string, KiteQuote>;
  }

  return {};
}

function getXmlValue(item: string, tag: string) {
  const escapedTag = tag.replace(":", "\\:");
  const match = item.match(
    new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"),
  );

  return match
    ? decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim())
    : "";
}

function parseNseEquityInstruments(csv: string): Instrument[] {
  const [headerLine, ...rows] = csv.split(/\r?\n/);
  if (!headerLine) return [];

  const headers = splitCsvLine(headerLine);
  const tokenIndex = headers.indexOf("instrument_token");
  const symbolIndex = headers.indexOf("tradingsymbol");
  const nameIndex = headers.indexOf("name");
  const segmentIndex = headers.indexOf("segment");
  const instrumentTypeIndex = headers.indexOf("instrument_type");

  if (tokenIndex === -1 || symbolIndex === -1 || nameIndex === -1) return [];

  return rows
    .map(splitCsvLine)
    .filter((row) => row.length > Math.max(symbolIndex, nameIndex))
    .filter(
      (row) =>
        row[segmentIndex] === "NSE" && row[instrumentTypeIndex] === "EQ",
    )
    .map((row) => ({
      instrumentToken: row[tokenIndex],
      tradingsymbol: normalizeNseSymbol(row[symbolIndex]),
      name: row[nameIndex],
    }))
    .filter((instrument) => instrument.tradingsymbol && instrument.name);
}

function parseNfoUnderlyingNames(csv: string) {
  const [headerLine, ...rows] = csv.split(/\r?\n/);
  if (!headerLine) return new Set<string>();

  const headers = splitCsvLine(headerLine);
  const nameIndex = headers.indexOf("name");
  const instrumentTypeIndex = headers.indexOf("instrument_type");

  if (nameIndex === -1) return new Set<string>();

  return new Set(
    rows
      .map(splitCsvLine)
      .filter((row) => row.length > nameIndex)
      .filter((row) => {
        if (instrumentTypeIndex === -1) return true;
        return ["FUT", "CE", "PE"].includes(row[instrumentTypeIndex]);
      })
      .map((row) => normalizeText(row[nameIndex]))
      .filter(Boolean),
  );
}

function isFnoEligible(
  instrument: Instrument,
  nfoUnderlyingNames: Set<string>,
) {
  return (
    nfoUnderlyingNames.has(normalizeText(instrument.name)) ||
    nfoUnderlyingNames.has(normalizeText(instrument.tradingsymbol))
  );
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);

  return values.map((item) => item.trim());
}

function hasWord(text: string, word: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(word)}(\\s|$)`).test(text);
}

function normalizeText(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadHistoricalAnalysis(
  instrumentToken: string,
  accessToken: string,
): Promise<AgentPick["history"]> {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 120);
  const result = await fetchZerodhaDailyCandles(
    instrumentToken,
    formatDate(from),
    formatDate(to),
    accessToken,
  );

  if (!Array.isArray(result.data)) {
    return unavailableHistory(result.message);
  }

  const candles = result.data
    .map(parseDailyCandle)
    .filter((candle): candle is DailyCandle => Boolean(candle));

  return analyzeHistoricalTrend(candles);
}

function parseDailyCandle(candle: unknown): DailyCandle | null {
  if (!Array.isArray(candle) || candle.length < 6) return null;

  const [timestamp, open, high, low, close, volume] = candle;

  if (
    typeof timestamp !== "string" ||
    ![open, high, low, close, volume].every(
      (value) => typeof value === "number",
    )
  ) {
    return null;
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  };
}

function getAgentVerdict(
  sentiment: AgentPick["sentiment"]["label"],
  history: AgentPick["history"],
  quoteDecision: AgentPick["signal"]["decision"],
): AgentPick["verdict"] {
  if (history.status === "Unavailable") return "Watch";

  if (sentiment === "Positive") {
    if (history.trend === "Bullish" && quoteDecision === "Actionable") {
      return "Consider";
    }

    return history.trend === "Bearish" || quoteDecision === "Avoid"
      ? "Avoid"
      : "Watch";
  }

  if (sentiment === "Negative") {
    return history.trend === "Bullish" && quoteDecision !== "Avoid"
      ? "Watch"
      : "Avoid";
  }

  if (
    sentiment === "Mixed" &&
    history.trend === "Bullish" &&
    quoteDecision !== "Avoid"
  ) {
    return "Watch";
  }

  return quoteDecision === "Avoid" || history.trend === "Bearish"
    ? "Avoid"
    : "Watch";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

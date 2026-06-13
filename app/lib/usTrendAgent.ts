import type { AgentPick, TrendHeadline } from "../types";
import {
  enrichHeadlineEvidence,
  htmlToPlainText,
} from "./articleEvidence";
import { analyzeNewsSentiment } from "./financialSentiment";
import { unavailableHistory } from "./historicalTrend";
import { recommendStrategy } from "./strategyRecommendation";
import { getServerConfig } from "./serverConfig";
import {
  buildQuoteSignals,
  type KiteQuote,
} from "./zerodhaSignalEngine";

type FinnhubNews = {
  datetime?: unknown;
  headline?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

type FinnhubQuote = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type FinnhubProfile = {
  country?: string;
  currency?: string;
  exchange?: string;
  name?: string;
  ticker?: string;
};

type SecCompany = {
  ticker: string;
  title: string;
};

type UsMention = {
  company: SecCompany;
  symbol: string;
  headlines: TrendHeadline[];
  sourceCount: number;
};

type RssBatch = {
  headlines: TrendHeadline[];
  sources: string[];
};

const maxNewsAgeHours = 72;
const rssSources = [
  {
    name: "Moneycontrol Market Reports",
    url: "https://www.moneycontrol.com/rss/marketreports.xml",
  },
  {
    name: "CNBC Finance",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  },
  {
    name: "MarketWatch Top Stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
];
const ignoredTickerWords = new Set([
  "A",
  "AI",
  "ALL",
  "ARE",
  "CAN",
  "CEO",
  "FOR",
  "IT",
  "ON",
  "OR",
  "SO",
  "US",
]);
const companySuffixes =
  /\b(CORPORATION|CORP|INCORPORATED|INC|LIMITED|LTD|PLC|CO)\b/g;
const ambiguousSingleWordCompanies = new Set([
  "ANY",
  "BLOCK",
  "HERE",
  "NASDAQ",
  "PAY",
  "PLAY",
  "SAFE",
  "UNIT",
  "YOU",
]);

export async function runUsTrendAgent() {
  const { FINNHUB_API_KEY: apiKey } = await getServerConfig();

  if (!apiKey) {
    return {
      picks: [],
      generatedAt: new Date().toISOString(),
      message:
        "Add FINNHUB_API_KEY to validate US news ideas with current US quotes.",
      sources: [],
    };
  }

  const [newsResult, rssBatch, secCompanies] = await Promise.all([
    fetchFinnhubNews(apiKey),
    fetchUsRssHeadlines(),
    fetchSecCompanies(),
  ]);
  const mentions = buildUsMentions(
    newsResult.news,
    rssBatch.headlines,
    secCompanies,
  ).slice(0, 12);
  const latestNews = buildLatestMarketNews(newsResult.news, rssBatch.headlines);
  const sources = [
    ...rssBatch.sources,
    ...(secCompanies.length > 0 ? ["SEC company ticker directory"] : []),
  ];

  if (mentions.length === 0) {
    return {
      picks: [],
      generatedAt: new Date().toISOString(),
      message:
        "No US-listed company was confidently matched from news published in the last 72 hours.",
      sources,
      latestNews,
    };
  }

  const validationResults = await Promise.allSettled(
    mentions.map(async (mention) => {
      const [quote, companyNews, profile] = await Promise.all([
        fetchFinnhubQuote(mention.symbol, apiKey),
        fetchFinnhubCompanyNews(mention.company, apiKey),
        fetchFinnhubProfile(mention.symbol, apiKey),
      ]);

      return {
        mention: {
          ...mention,
          headlines: mergeHeadlines(mention.headlines, companyNews),
        },
        quote,
        profile,
      };
    }),
  );
  const quotes: Record<string, KiteQuote> = {};
  const validatedMentions: UsMention[] = [];

  for (const result of validationResults) {
    if (result.status !== "fulfilled" || !result.value) continue;

    const { mention, profile, quote } = result.value;

    if (
      !isValidFinnhubProfile(profile, mention.symbol) ||
      !isValidFinnhubQuote(quote) ||
      mention.headlines.length === 0
    ) {
      continue;
    }

    quotes[`US:${mention.symbol}`] = {
      last_price: quote.c,
      timestamp: quote.t,
      ohlc: {
        close: quote.pc,
        high: quote.h,
        low: quote.l,
        open: quote.o,
      },
    };
    validatedMentions.push({
      ...mention,
      sourceCount: new Set(mention.headlines.map((headline) => headline.source))
        .size,
    });
  }

  const enrichedEvidence = await enrichHeadlineEvidence(
    validatedMentions.flatMap((mention) => mention.headlines),
  );
  const enrichedHeadlineByLink = new Map(
    enrichedEvidence.headlines.map((headline) => [headline.link, headline]),
  );
  const signals = buildQuoteSignals(quotes, "US", "finnhub");
  const signalBySymbol = new Map(signals.map((signal) => [signal.symbol, signal]));
  const picks = validatedMentions
    .map((mention): AgentPick | null => {
      const signal = signalBySymbol.get(mention.symbol);

      if (!signal) return null;

      const analyzedHeadlines = mention.headlines.map(
        (headline) => enrichedHeadlineByLink.get(headline.link) ?? headline,
      );
      const latestPublishedAt = getLatestPublishedAt(analyzedHeadlines);
      const sentiment = analyzeNewsSentiment(
        analyzedHeadlines,
        enrichedEvidence.evidenceByLink,
        [mention.symbol, mention.company.title],
      );
      const history = unavailableHistory(
        "Unavailable: the configured Finnhub plan does not permit the daily candle endpoint, so 20/60-session returns, moving averages and drawdown are not calculated.",
      );
      const verdict: AgentPick["verdict"] =
        sentiment.label === "Negative" ? "Avoid" : "Watch";
      const strategy = recommendStrategy({
        verdict,
        sentiment,
        history,
        signal,
        latestPublishedAt,
        fnoEligible: false,
      });

      return {
        symbol: mention.symbol,
        sourceCount: mention.sourceCount,
        headlineCount: mention.headlines.length,
        latestPublishedAt,
        verdict,
        strategy,
        sentiment,
        history,
        reason: `${mention.symbol} was validated with ${mention.headlines.length} company-specific report${mention.headlines.length === 1 ? "" : "s"} from ${mention.sourceCount} source${mention.sourceCount === 1 ? "" : "s"}, ${sentiment.fullTextArticles} full-text analysis, ${sentiment.summaryArticles} summary analysis, and a current Finnhub quote snapshot. Entry, stop and target values are Stock Analyzer calculations, not Finnhub predictions.`,
        signal,
        headlines: sortHeadlinesNewestFirst(analyzedHeadlines).slice(0, 3),
      } satisfies AgentPick;
    })
    .filter((pick): pick is AgentPick => Boolean(pick))
    .sort(compareAgentPicks)
    .slice(0, 8);

  return {
    picks,
    generatedAt: new Date().toISOString(),
    message:
      picks.length > 0
        ? undefined
        : "News was found, but no current Finnhub quote was available for the matched US symbols.",
    sources: [...sources, "Finnhub Company News", "Finnhub Quotes"],
    latestNews,
  };
}

async function fetchFinnhubNews(apiKey: string) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" },
    );

    if (!response.ok) return { news: [], available: false };

    return {
      news: (await response.json()) as FinnhubNews[],
      available: true,
    };
  } catch {
    return { news: [], available: false };
  }
}

async function fetchFinnhubQuote(symbol: string, apiKey: string) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    return (await response.json()) as FinnhubQuote;
  } catch {
    return null;
  }
}

async function fetchFinnhubProfile(symbol: string, apiKey: string) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    return (await response.json()) as FinnhubProfile;
  } catch {
    return null;
  }
}

async function fetchFinnhubCompanyNews(
  company: SecCompany,
  apiKey: string,
): Promise<TrendHeadline[]> {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 3);

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(company.ticker)}&from=${formatDate(from)}&to=${formatDate(to)}&token=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" },
    );

    if (!response.ok) return [];

    const news = (await response.json()) as FinnhubNews[];

    return news
      .slice(0, 100)
      .map((item): TrendHeadline | null => {
        if (!item.headline || !item.url) return null;

        const publishedAt = parseUnixTimestamp(item.datetime);

        if (
          !isRecentHeadline(publishedAt) ||
          !companyMatchesHeadline(company, item.headline)
        ) {
          return null;
        }

        return {
          title: decodeXml(item.headline),
          link: item.url,
          source: item.source || "Finnhub Company News",
          publishedAt,
          summary: htmlToPlainText(item.summary) || null,
        };
      })
      .filter((headline): headline is TrendHeadline => Boolean(headline))
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function fetchUsRssHeadlines(): Promise<RssBatch> {
  const responses = await Promise.allSettled(
    rssSources.map(async (source) => {
      const response = await fetch(source.url, {
        cache: "no-store",
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, text/html",
        },
      });

      if (!response.ok) return { headlines: [], source: null };

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

async function fetchSecCompanies(): Promise<SecCompany[]> {
  try {
    const response = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "StockAnalyzer research app",
        },
      },
    );

    if (!response.ok) return [];

    const payload = (await response.json()) as Record<
      string,
      { ticker?: string; title?: string }
    >;

    return Object.values(payload)
      .map((company) => ({
        ticker: company.ticker?.trim().toUpperCase() ?? "",
        title: company.title?.trim() ?? "",
      }))
      .filter((company) => company.ticker && company.title);
  } catch {
    return [];
  }
}

function buildUsMentions(
  news: FinnhubNews[],
  rssHeadlines: TrendHeadline[],
  secCompanies: SecCompany[],
) {
  const mentions = new Map<string, UsMention>();

  for (const item of news.slice(0, 100)) {
    if (!item.headline || !item.url) continue;

    const publishedAt = parseUnixTimestamp(item.datetime);

    if (!isRecentHeadline(publishedAt)) continue;

    const headline: TrendHeadline = {
      title: item.headline,
      link: item.url,
      source: item.source || "Finnhub Market News",
      publishedAt,
      summary: htmlToPlainText(item.summary) || null,
    };
    for (const company of secCompanies) {
      if (companyMatchesHeadline(company, item.headline)) {
        addMention(mentions, company, {
          ...headline,
          title: decodeXml(headline.title),
        });
      }
    }
  }

  for (const headline of rssHeadlines) {
    for (const company of secCompanies) {
      if (companyMatchesHeadline(company, headline.title)) {
        addMention(mentions, company, headline);
      }
    }
  }

  return [...mentions.values()].sort((first, second) => {
    if (second.sourceCount !== first.sourceCount) {
      return second.sourceCount - first.sourceCount;
    }

    return (
      new Date(getLatestPublishedAt(second.headlines)).getTime() -
      new Date(getLatestPublishedAt(first.headlines)).getTime()
    );
  });
}

function buildLatestMarketNews(
  news: FinnhubNews[],
  rssHeadlines: TrendHeadline[],
) {
  const headlines = news
    .map((item): TrendHeadline | null => {
      if (!item.headline || !item.url) return null;

      const publishedAt = parseUnixTimestamp(item.datetime);

      if (
        !isRecentHeadline(publishedAt) ||
        !isMarketRelevantHeadline(item.headline)
      ) {
        return null;
      }

      return {
        title: decodeXml(item.headline),
        link: item.url,
        source: item.source || "Finnhub Market News",
        publishedAt,
        summary: htmlToPlainText(item.summary) || null,
      };
    })
    .filter((headline): headline is TrendHeadline => Boolean(headline));
  const unique = new Map<string, TrendHeadline>();

  for (const headline of [...headlines, ...rssHeadlines]) {
    unique.set(headline.link, headline);
  }

  return sortHeadlinesNewestFirst([...unique.values()]).slice(0, 12);
}

function isMarketRelevantHeadline(headline: string) {
  return /\b(stock|stocks|share|shares|market|markets|earnings|revenue|profit|guidance|ipo|nasdaq|nyse|investor|investors|valuation|merger|acquisition|dividend|spacex)\b/i.test(
    headline,
  );
}

function companyMatchesHeadline(
  company: SecCompany,
  headline: string,
) {
  const explicitTicker = new RegExp(
    `(\\$${escapeRegExp(company.ticker)}\\b|\\(${escapeRegExp(company.ticker)}\\)|\\b(?:NASDAQ|NYSE)\\s*[:\\-]\\s*${escapeRegExp(company.ticker)}\\b)`,
    "i",
  );

  if (!ignoredTickerWords.has(company.ticker) && explicitTicker.test(headline)) {
    return true;
  }

  const normalizedHeadline = normalizeText(decodeXml(headline));
  const companyName = normalizeText(company.title)
    .replace(companySuffixes, " ")
    .replace(/\s+/g, " ")
    .trim();
  const companyTokens = companyName.split(" ").filter(Boolean);

  if (
    companyName.length < 5 ||
    (companyTokens.length === 1 &&
      ambiguousSingleWordCompanies.has(companyName))
  ) {
    return false;
  }

  if (companyTokens.length === 1) {
    const properName = companyName
      .toLowerCase()
      .replace(/(^|[\s-])\w/g, (character) => character.toUpperCase());
    const properNamePattern = new RegExp(
      `(^|[^A-Za-z])${escapeRegExp(properName)}([^A-Za-z]|$)`,
    );
    const uppercasePattern = new RegExp(
      `(^|[^A-Z])${escapeRegExp(companyName)}([^A-Z]|$)`,
    );

    return (
      properNamePattern.test(decodeXml(headline)) ||
      uppercasePattern.test(decodeXml(headline))
    );
  }

  return hasPhrase(normalizedHeadline, companyName);
}

function addMention(
  mentions: Map<string, UsMention>,
  company: SecCompany,
  headline: TrendHeadline,
) {
  const current = mentions.get(company.ticker) ?? {
    company,
    symbol: company.ticker,
    headlines: [],
    sourceCount: 0,
  };

  if (!current.headlines.some((existing) => existing.link === headline.link)) {
    current.headlines.push(headline);
  }

  current.sourceCount = new Set(
    current.headlines.map((existing) => existing.source),
  ).size;
  mentions.set(company.ticker, current);
}

function parseRss(xml: string, source: string): TrendHeadline[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match): TrendHeadline | null => {
      const item = match[0];
      const title = getXmlValue(item, "title");
      const link = getXmlValue(item, "link");
      const publishedAt =
        getXmlValue(item, "pubDate") || getXmlValue(item, "dc:date");
      const summary = htmlToPlainText(
        getXmlValue(item, "content:encoded") ||
          getXmlValue(item, "description"),
      );

      if (!title || !link) return null;

      return {
        title,
        link,
        source,
        publishedAt: parsePublishedAt(publishedAt),
        summary: summary || null,
      };
    })
    .filter((headline): headline is TrendHeadline => Boolean(headline))
    .filter((headline) => isRecentHeadline(headline.publishedAt))
    .slice(0, 30);
}

function isRecentHeadline(publishedAt: string | null) {
  if (!publishedAt) return false;

  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 36e5;

  return ageHours >= 0 && ageHours <= maxNewsAgeHours;
}

function isValidFinnhubQuote(
  quote: FinnhubQuote | null,
): quote is Required<Pick<FinnhubQuote, "c" | "h" | "l" | "o" | "pc">> &
  FinnhubQuote {
  if (!quote) return false;

  const values = [quote.c, quote.h, quote.l, quote.o, quote.pc];

  return (
    values.every((value) => typeof value === "number" && value > 0) &&
    (quote.h as number) >= (quote.l as number)
  );
}

function isValidFinnhubProfile(
  profile: FinnhubProfile | null,
  symbol: string,
) {
  return Boolean(
    profile?.name &&
      profile.ticker?.toUpperCase() === symbol &&
      profile.currency?.toUpperCase() === "USD" &&
      profile.exchange,
  );
}

function mergeHeadlines(
  first: TrendHeadline[],
  second: TrendHeadline[],
) {
  const merged = new Map<string, TrendHeadline>();

  for (const headline of [...first, ...second]) {
    merged.set(headline.link, headline);
  }

  return sortHeadlinesNewestFirst([...merged.values()]).slice(0, 15);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function compareAgentPicks(first: AgentPick, second: AgentPick) {
  const recencyDifference =
    new Date(second.latestPublishedAt).getTime() -
    new Date(first.latestPublishedAt).getTime();

  if (recencyDifference !== 0) return recencyDifference;
  if (second.sourceCount !== first.sourceCount) {
    return second.sourceCount - first.sourceCount;
  }

  return second.signal.confidence - first.signal.confidence;
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

function getXmlValue(item: string, tag: string) {
  const escapedTag = tag.replace(":", "\\:");
  const match = item.match(
    new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"),
  );

  return match
    ? decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim())
    : "";
}

function parsePublishedAt(value?: string) {
  if (!value) return null;

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function parseUnixTimestamp(value: unknown) {
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const milliseconds = seconds > 1e12 ? seconds : seconds * 1000;
  const timestamp = new Date(milliseconds);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function hasPhrase(text: string, phrase: string) {
  return new RegExp(
    `(^|\\s)${escapeRegExp(phrase).replace(/\\ /g, "\\s+")}(\\s|$)`,
  ).test(text);
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
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

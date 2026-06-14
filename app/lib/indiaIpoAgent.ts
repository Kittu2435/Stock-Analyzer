import "server-only";

import type {
  AgentPick,
  IndiaIpoCandidate,
  TrendHeadline,
} from "../types";
import { enrichHeadlineEvidence } from "./articleEvidence";
import { analyzeNewsSentiment } from "./financialSentiment";
import {
  fetchMarketHeadlines,
  type IndiaNewsBatch,
} from "./marketTrendAgent";

type NseIpoIssue = {
  companyName?: unknown;
  company?: unknown;
  issueEndDate?: unknown;
  issuePrice?: unknown;
  issueSize?: unknown;
  issueStartDate?: unknown;
  lotSize?: unknown;
  priceBand?: unknown;
  series?: unknown;
  status?: unknown;
  symbol?: unknown;
};

const nseIpoPage =
  "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
const nseBaseUrl = "https://www.nseindia.com";
const nseUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

export async function runIndiaIpoAgent(newsOverride?: IndiaNewsBatch) {
  const [ipoBatch, newsBatch] = await Promise.all([
    fetchNseIpoIssues(),
    newsOverride ? Promise.resolve(newsOverride) : fetchMarketHeadlines(),
  ]);
  const matches = ipoBatch.issues.map((issue) => ({
    issue,
    headlines: findIpoHeadlines(issue, newsBatch.headlines),
  }));
  const enriched = await enrichHeadlineEvidence(
    matches.flatMap((match) => match.headlines),
    8,
  );
  const headlineByLink = new Map(
    enriched.headlines.map((headline) => [headline.link, headline]),
  );
  const ipos = matches
    .map(({ issue, headlines }) =>
      buildIpoCandidate(
        issue,
        headlines.map(
          (headline) => headlineByLink.get(headline.link) ?? headline,
        ),
        enriched.evidenceByLink,
      ),
    )
    .sort(compareIpos);

  return {
    generatedAt: new Date().toISOString(),
    ipos,
    sources: ["NSE India IPO", ...newsBatch.sources],
    message:
      ipos.length > 0
        ? undefined
        : ipoBatch.available
          ? "NSE currently reports no open or forthcoming IPO issues."
          : "The official NSE IPO source is temporarily unavailable.",
  };
}

async function fetchNseIpoIssues() {
  try {
    const landingResponse = await fetch(nseIpoPage, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": nseUserAgent,
      },
    });
    const cookies = getResponseCookies(landingResponse);
    const headers = {
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookies,
      Referer: nseIpoPage,
      "User-Agent": nseUserAgent,
    };
    const [currentResponse, upcomingResponse] = await Promise.all([
      fetch(`${nseBaseUrl}/api/ipo-current-issue`, {
        cache: "no-store",
        headers,
      }),
      fetch(`${nseBaseUrl}/api/all-upcoming-issues?category=ipo`, {
        cache: "no-store",
        headers,
      }),
    ]);
    const current = currentResponse.ok
      ? ((await currentResponse.json()) as unknown)
      : [];
    const upcoming = upcomingResponse.ok
      ? ((await upcomingResponse.json()) as unknown)
      : [];

    const issues = [...parseIssueArray(current), ...parseIssueArray(upcoming)]
      .map(normalizeIssue)
      .filter((issue): issue is NormalizedIpoIssue => Boolean(issue))
      .filter(
        (issue, index, allIssues) =>
          allIssues.findIndex(
            (candidate) =>
              candidate.symbol === issue.symbol &&
              candidate.issueStartDate === issue.issueStartDate,
          ) === index,
      );

    return {
      available: currentResponse.ok || upcomingResponse.ok,
      issues,
    };
  } catch (error) {
    console.error("Unable to load NSE IPO issues:", error);
    return {
      available: false,
      issues: [] as NormalizedIpoIssue[],
    };
  }
}

type NormalizedIpoIssue = {
  companyName: string;
  issueEndDate: string | null;
  issueSizeShares: number | null;
  issueStartDate: string | null;
  lotSize: number | null;
  priceBand: string | null;
  series: string;
  status: string;
  symbol: string;
  upperPrice: number | null;
};

function normalizeIssue(issue: NseIpoIssue): NormalizedIpoIssue | null {
  const companyName = getString(issue.companyName) || getString(issue.company);
  const symbol = getString(issue.symbol).toUpperCase();

  if (!companyName || !symbol) return null;

  const priceBand =
    getString(issue.priceBand) || getString(issue.issuePrice) || null;
  const lotSize = getPositiveNumber(issue.lotSize);

  return {
    companyName,
    symbol,
    series: getString(issue.series) || "IPO",
    status: getString(issue.status) || "Current",
    issueStartDate: normalizeNseDate(issue.issueStartDate),
    issueEndDate: normalizeNseDate(issue.issueEndDate),
    priceBand,
    issueSizeShares: getPositiveNumber(issue.issueSize),
    lotSize,
    upperPrice: getUpperPrice(priceBand),
  };
}

function buildIpoCandidate(
  issue: NormalizedIpoIssue,
  headlines: TrendHeadline[],
  evidenceByLink: Map<string, import("./articleEvidence").ArticleEvidence>,
): IndiaIpoCandidate {
  const sentiment = analyzeNewsSentiment(
    headlines,
    evidenceByLink,
    [issue.symbol, issue.companyName],
  );
  const sourceCount = new Set(headlines.map((headline) => headline.source)).size;
  const minimumInvestment =
    issue.upperPrice && issue.lotSize
      ? issue.upperPrice * issue.lotSize
      : null;
  const riskFlags = getRiskFlags(
    issue,
    sentiment,
    sourceCount,
    minimumInvestment,
  );
  const verdict = getIpoVerdict(issue, sentiment, sourceCount);

  return {
    companyName: issue.companyName,
    symbol: issue.symbol,
    series: issue.series,
    status: issue.status,
    issueStartDate: issue.issueStartDate,
    issueEndDate: issue.issueEndDate,
    priceBand: issue.priceBand,
    issueSizeShares: issue.issueSizeShares,
    lotSize: issue.lotSize,
    minimumInvestment,
    verdict,
    reason: getIpoReason(issue, sentiment, sourceCount, verdict),
    listingGainEstimate:
      "Not forecast. NSE issue terms and public news do not provide a reliable listing-price estimate.",
    riskFlags,
    sourceUrl: nseIpoPage,
    sourceCount,
    sentiment,
    headlines: sortHeadlinesNewestFirst(headlines).slice(0, 3),
  };
}

function getIpoVerdict(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
): IndiaIpoCandidate["verdict"] {
  if (sentiment.label === "Negative") return "Avoid";

  if (
    sentiment.evidenceQuality === "Weak" ||
    sentiment.explicitEvidenceArticles === 0
  ) {
    return "Insufficient evidence";
  }

  if (!isIssueOpen(issue.status)) return "Watch";

  const isSme = issue.series.toUpperCase().includes("SME");

  if (
    sentiment.label === "Positive" &&
    (isSme
      ? sentiment.evidenceQuality === "Strong" && sourceCount >= 2
      : sourceCount >= 1)
  ) {
    return "Consider applying";
  }

  return "Watch";
}

function getRiskFlags(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  minimumInvestment: number | null,
) {
  const flags = [
    "No listed price history exists before the IPO begins trading.",
    "Allotment and listing gains are not guaranteed.",
  ];

  if (issue.series.toUpperCase().includes("SME")) {
    flags.push("SME issue: liquidity, spread, and lot-size risk can be higher.");
  }

  if (minimumInvestment !== null && minimumInvestment >= 100_000) {
    flags.push("The minimum application amount creates concentrated exposure.");
  }

  if (sentiment.evidenceQuality === "Weak") {
    flags.push("Recent article-level financial evidence is insufficient.");
  }

  if (sourceCount < 2) {
    flags.push("Independent news-source confirmation is limited.");
  }

  return flags;
}

function getIpoReason(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  verdict: IndiaIpoCandidate["verdict"],
) {
  return `${verdict}: NSE lists ${issue.companyName} as ${issue.status.toLowerCase()}. The agent found ${headlinesText(sentiment, sourceCount)}. IPOs do not have Zerodha price history before listing, so the verdict is based on official issue terms and article-level evidence only.`;
}

function headlinesText(sentiment: AgentPick["sentiment"], sourceCount: number) {
  return `${sentiment.fullTextArticles} full-text report${sentiment.fullTextArticles === 1 ? "" : "s"}, ${sentiment.summaryArticles} summary report${sentiment.summaryArticles === 1 ? "" : "s"}, and ${sourceCount} independent news source${sourceCount === 1 ? "" : "s"}`;
}

function findIpoHeadlines(
  issue: NormalizedIpoIssue,
  headlines: TrendHeadline[],
) {
  const companyName = normalizeCompanyName(issue.companyName);
  const companyTokens = companyName
    .split(" ")
    .filter((token) => token.length >= 4);

  return headlines.filter((headline) => {
    const text = normalizeText(`${headline.title} ${headline.summary ?? ""}`);

    if (hasWord(text, issue.symbol)) return true;
    if (companyName.length >= 6 && text.includes(companyName)) return true;

    const matchedTokens = companyTokens.filter((token) => hasWord(text, token));
    return matchedTokens.length >= Math.min(2, companyTokens.length);
  });
}

function compareIpos(
  first: IndiaIpoCandidate,
  second: IndiaIpoCandidate,
) {
  const verdictRank: Record<IndiaIpoCandidate["verdict"], number> = {
    "Consider applying": 4,
    Watch: 3,
    "Insufficient evidence": 2,
    Avoid: 1,
  };
  const verdictDifference =
    verdictRank[second.verdict] - verdictRank[first.verdict];

  if (verdictDifference !== 0) return verdictDifference;

  return (
    new Date(first.issueStartDate ?? "9999-12-31").getTime() -
    new Date(second.issueStartDate ?? "9999-12-31").getTime()
  );
}

function sortHeadlinesNewestFirst(headlines: TrendHeadline[]) {
  return [...headlines].sort(
    (first, second) =>
      new Date(second.publishedAt ?? 0).getTime() -
      new Date(first.publishedAt ?? 0).getTime(),
  );
}

function isIssueOpen(status: string) {
  return /\b(open|active|current)\b/i.test(status);
}

function getUpperPrice(priceBand: string | null) {
  if (!priceBand) return null;

  const values = priceBand.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return values.length > 0 ? Math.max(...values) : null;
}

function normalizeNseDate(value: unknown) {
  const text = getString(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return text;

  const month = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  }[match[2]];

  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : text;
}

function getResponseCookies(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.() ?? [];
  const values =
    setCookies.length > 0
      ? setCookies
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];

  return values
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function parseIssueArray(value: unknown): NseIpoIssue[] {
  if (Array.isArray(value)) return value as NseIpoIssue[];
  if (!value || typeof value !== "object") return [];

  const object = value as Record<string, unknown>;
  const candidates = [
    object.data,
    object.currentIssueDetails,
    object.issueDetails,
    object.forthcomingIssueDetails,
  ];

  return candidates.find(Array.isArray) as NseIpoIssue[] | undefined ?? [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPositiveNumber(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : Number.NaN;

  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeCompanyName(value: string) {
  return normalizeText(value).replace(
    /\b(LIMITED|LTD|PRIVATE|PVT|INDIA|INDUSTRIES|COMPANY|CORPORATION)\b/g,
    " ",
  ).replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text: string, word: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(word)}(\\s|$)`).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

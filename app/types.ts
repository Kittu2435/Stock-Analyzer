export type TradeType = "Intraday" | "Hold" | "F&O" | "No Trade";
export type Trend = "Strong" | "Neutral" | "Weak";
export type EntryStyle = "Breakout" | "Pullback" | "Wait";
export type StrategyType =
  | "Intraday"
  | "Swing"
  | "Long Term"
  | "F&O"
  | "No Trade";

export type ZerodhaHolding = {
  tradingsymbol: string;
  quantity: number;
  last_price?: number;
  average_price?: number;
  pnl?: number;
};

export type ZerodhaPosition = {
  tradingsymbol: string;
  quantity: number;
  pnl?: number;
  m2m?: number;
};

export type ZerodhaAccountSummary = {
  connected: boolean;
  profileName?: string;
  holdings: ZerodhaHolding[];
  positions: ZerodhaPosition[];
  error?: string;
};

export type TradeSignal = {
  symbol: string;
  exchange: "NSE" | "US";
  tradeType: TradeType;
  decision: "Actionable" | "Watch" | "Avoid";
  confidence: number;
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  volume: number | null;
  trend: Trend;
  entryPlan: {
    preferred: EntryStyle;
    summary: string;
    breakoutTrigger: number | null;
    pullbackLow: number | null;
    pullbackHigh: number | null;
    stopLoss: number | null;
    targets: number[];
    noChaseAbove: number | null;
    condition: string;
  };
  exitRule: string;
  fnoPlan: string;
  reason: string;
  scores: {
    trend: number | null;
    volume: number | null;
    risk: number | null;
  };
  source: "zerodha" | "finnhub";
  providerTimestamp: string | null;
  lastUpdated: string;
};

export type TrendHeadline = {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary?: string | null;
  analysisDepth?: "Full article" | "Summary" | "Headline only";
  analyzedWordCount?: number;
};

export type AgentPick = {
  symbol: string;
  sourceCount: number;
  headlineCount: number;
  latestPublishedAt: string;
  verdict: "Consider" | "Watch" | "Avoid";
  strategy: {
    type: StrategyType;
    holdingPeriod: string;
    fnoEligible: boolean;
    reason: string;
  };
  sentiment: {
    label: "Positive" | "Negative" | "Mixed" | "Neutral";
    positiveHeadlines: number;
    negativeHeadlines: number;
    neutralHeadlines: number;
    fullTextArticles: number;
    summaryArticles: number;
    headlineOnlyArticles: number;
    explicitEvidenceArticles: number;
    evidenceQuality: "Strong" | "Moderate" | "Weak";
    evidence: string[];
  };
  history: {
    status: "Available" | "Unavailable";
    trend: "Bullish" | "Neutral" | "Bearish";
    return20d: number | null;
    return60d: number | null;
    aboveSma20: boolean | null;
    aboveSma50: boolean | null;
    maxDrawdown60d: number | null;
    reason: string;
  };
  reason: string;
  signal: TradeSignal;
  headlines: TrendHeadline[];
};

export type IndiaIpoCandidate = {
  companyName: string;
  symbol: string;
  series: string;
  status: string;
  issueStartDate: string | null;
  issueEndDate: string | null;
  priceBand: string | null;
  issueSizeShares: number | null;
  lotSize: number | null;
  minimumInvestment: number | null;
  verdict: "Consider applying" | "Watch" | "Avoid" | "Insufficient evidence";
  reason: string;
  listingGainEstimate: string;
  riskFlags: string[];
  sourceUrl: string;
  sourceCount: number;
  sentiment: AgentPick["sentiment"];
  headlines: TrendHeadline[];
};

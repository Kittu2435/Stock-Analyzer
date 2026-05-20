export type Market = "India" | "US";
export type Horizon = "Intraday" | "Hold";
export type Recommendation = "Intraday pick" | "Hold pick" | "Watch" | "Avoid";

export type MarketFilter = "All" | Market;
export type HorizonFilter = "All" | Horizon;

export type BrokerStatus = {
  name: string;
  status: string;
  detail: string;
};

export type NewsArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: string;
};

export type MarketSnapshot = {
  price: string;
  changePercent: string;
  volume: string;
  trend: "Strong" | "Neutral" | "Weak";
};

export type Signal = {
  symbol: string;
  market: Market;
  horizon: Horizon;
  confidence: string;
  recommendation: Recommendation;
  broker: "Zerodha" | "INDmoney";
  trigger: string;
  invalidation: string;
  reviewPlan: string;
  reason: string;
  newsCatalyst: string;
  technicalView: string;
  volumeView: string;
  fundamentalView: string;
  riskView: string;
  fnoView: string;
  scores: {
    news: number;
    technical: number;
    volume: number;
    fundamentals: number;
    risk: number;
  };
  dataSource?: "mock" | "alpha-vantage";
  latestNews?: NewsArticle[];
  marketSnapshot: MarketSnapshot;
  lastUpdated?: string;
};

export type ResearchBrief = {
  suitableFor: Horizon;
  overallScore: number;
  verdict: Recommendation;
  keyReasons: string[];
  checks: string[];
  warnings: string[];
};

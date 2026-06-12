import type { EntryStyle, TradeSignal, Trend } from "../types";

export type KiteQuote = {
  last_price?: number;
  volume?: number;
  timestamp?: unknown;
  ohlc?: {
    close?: number;
    high?: number;
    low?: number;
    open?: number;
  };
};

export function buildZerodhaSignals(quotes: Record<string, KiteQuote>) {
  return buildQuoteSignals(quotes, "NSE", "zerodha");
}

export function buildQuoteSignals(
  quotes: Record<string, KiteQuote>,
  exchange: TradeSignal["exchange"],
  source: TradeSignal["source"],
) {
  return Object.entries(quotes)
    .map(([instrument, quote]) => buildSignal(instrument, quote, exchange, source))
    .filter((signal): signal is TradeSignal => Boolean(signal))
    .sort((first, second) => second.confidence - first.confidence);
}

function buildSignal(
  instrument: string,
  quote: KiteQuote,
  exchange: TradeSignal["exchange"],
  source: TradeSignal["source"],
): TradeSignal | null {
  const symbol = instrument.replace(/^[A-Z]+:/, "");
  const price = quote.last_price;

  if (!symbol || typeof price !== "number" || price <= 0) {
    return null;
  }

  const previousClose = quote.ohlc?.close ?? null;
  const dayHigh = quote.ohlc?.high ?? price;
  const dayLow = quote.ohlc?.low ?? price;
  const changePercent =
    previousClose && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;
  const trend = getTrend(changePercent);
  const trendScore = getTrendScore(changePercent);
  const volumeScore = getVolumeScore(quote.volume);
  const riskScore = getRiskScore(changePercent, dayHigh, dayLow, price);
  const confidence = getConfidence(trendScore, volumeScore, riskScore);
  const adjustedConfidence =
    source === "finnhub" && volumeScore === null
      ? Math.min(confidence, 55)
      : confidence;
  const tradeType = getTradeType(
    trend,
    adjustedConfidence,
    volumeScore,
    riskScore,
  );
  const entryPlan = buildEntryPlan(
    tradeType,
    trend,
    price,
    dayHigh,
    dayLow,
    riskScore,
  );
  const providerTimestamp = parseUnixTimestamp(quote.timestamp);

  return {
    symbol,
    exchange,
    tradeType,
    decision: getDecision(tradeType),
    confidence: adjustedConfidence,
    price,
    previousClose,
    changePercent,
    volume: quote.volume ?? null,
    trend,
    entryPlan,
    exitRule: getExitRule(tradeType),
    fnoPlan: getFnoPlan(tradeType, adjustedConfidence, riskScore),
    reason: getReason(
      source,
      trend,
      adjustedConfidence,
      volumeScore,
      riskScore,
    ),
    scores: {
      trend: trendScore,
      volume: volumeScore,
      risk: riskScore,
    },
    source,
    providerTimestamp,
    lastUpdated: providerTimestamp ?? new Date().toISOString(),
  };
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

function getTrend(changePercent: number | null): Trend {
  if (changePercent === null) return "Neutral";
  if (changePercent >= 1) return "Strong";
  if (changePercent <= -1) return "Weak";
  return "Neutral";
}

function getTrendScore(changePercent: number | null) {
  if (changePercent === null) return null;
  return clamp(Math.round(50 + changePercent * 12));
}

function getVolumeScore(volume?: number) {
  if (!volume || volume <= 0) return null;
  return clamp(Math.round((Math.log10(volume) - 4) * 22));
}

function getRiskScore(
  changePercent: number | null,
  dayHigh: number,
  dayLow: number,
  price: number,
) {
  const rangePercent = price > 0 ? ((dayHigh - dayLow) / price) * 100 : 0;
  const movePenalty = changePercent === null ? 10 : Math.abs(changePercent) * 8;
  const rangePenalty = rangePercent * 5;

  return clamp(Math.round(100 - movePenalty - rangePenalty));
}

function getConfidence(
  trendScore: number | null,
  volumeScore: number | null,
  riskScore: number | null,
) {
  const values = [
    { score: trendScore, weight: 0.4 },
    { score: volumeScore, weight: 0.25 },
    { score: riskScore, weight: 0.35 },
  ].filter((item): item is { score: number; weight: number } => item.score !== null);

  if (values.length === 0) return 0;

  const score = values.reduce((total, item) => total + item.score * item.weight, 0);
  const weight = values.reduce((total, item) => total + item.weight, 0);

  return clamp(Math.round(score / weight));
}

function getTradeType(
  trend: Trend,
  confidence: number,
  volumeScore: number | null,
  riskScore: number | null,
): TradeSignal["tradeType"] {
  if (trend === "Weak" || confidence < 45 || (riskScore !== null && riskScore < 45)) {
    return "No Trade";
  }

  if (trend === "Strong" && confidence >= 68 && (volumeScore ?? 0) >= 60) {
    return "Intraday";
  }

  if (confidence >= 55) {
    return "Hold";
  }

  return "No Trade";
}

function getDecision(tradeType: TradeSignal["tradeType"]) {
  if (tradeType === "No Trade") return "Avoid";
  if (tradeType === "Hold") return "Watch";
  return "Actionable";
}

function buildEntryPlan(
  tradeType: TradeSignal["tradeType"],
  trend: Trend,
  price: number,
  dayHigh: number,
  dayLow: number,
  riskScore: number | null,
): TradeSignal["entryPlan"] {
  if (tradeType === "No Trade") {
    return {
      preferred: "Wait",
      summary: "No entry until price action and risk quality improve.",
      breakoutTrigger: null,
      pullbackLow: null,
      pullbackHigh: null,
      stopLoss: null,
      targets: [],
      noChaseAbove: null,
      condition: "Wait for a fresh setup instead of buying only because price moved.",
    };
  }

  const sessionRange = Math.max(dayHigh - dayLow, price * 0.01);
  const breakoutBuffer = Math.max(price * 0.001, sessionRange * 0.05);
  const breakoutTrigger = roundPrice(Math.max(dayHigh, price) + breakoutBuffer);
  const pullbackHigh = roundPrice(
    Math.max(dayLow, Math.min(price * 0.9975, price - sessionRange * 0.2)),
  );
  const pullbackLow = roundPrice(
    Math.max(dayLow, pullbackHigh - Math.max(sessionRange * 0.2, price * 0.005)),
  );
  const stopBuffer = Math.max(price * 0.005, sessionRange * 0.1);
  const stopLoss = roundPrice(Math.max(0.05, Math.min(dayLow, pullbackLow) - stopBuffer));
  const pullbackEntry = (pullbackLow + pullbackHigh) / 2;
  const riskPerShare = Math.max(pullbackEntry - stopLoss, price * 0.005);
  const targetOne = roundPrice(Math.max(dayHigh, pullbackEntry + riskPerShare * 1.5));
  const targetTwo = roundPrice(
    Math.max(
      targetOne + riskPerShare,
      pullbackEntry + riskPerShare * 2.5,
    ),
  );
  const noChaseAbove = roundPrice(
    breakoutTrigger + Math.max(sessionRange * 0.3, price * 0.005),
  );
  const preferred = getPreferredEntryStyle(
    tradeType,
    trend,
    price,
    dayHigh,
    sessionRange,
    riskScore,
  );

  return {
    preferred,
    summary:
      preferred === "Breakout"
        ? `Prefer a confirmed breakout above ${formatMoney(breakoutTrigger)}.`
        : `Prefer a pullback into ${formatMoney(pullbackLow)}-${formatMoney(pullbackHigh)} instead of chasing.`,
    breakoutTrigger,
    pullbackLow,
    pullbackHigh,
    stopLoss,
    targets: [targetOne, targetTwo],
    noChaseAbove,
    condition:
      preferred === "Breakout"
        ? "Enter only if price holds above the trigger and volume expands; skip a quick rejection."
        : "Enter only if the pullback zone holds and price shows a reversal; do not average below stop-loss.",
  };
}

function getPreferredEntryStyle(
  tradeType: TradeSignal["tradeType"],
  trend: Trend,
  price: number,
  dayHigh: number,
  sessionRange: number,
  riskScore: number | null,
): EntryStyle {
  if (tradeType === "Hold") return "Pullback";

  const nearSessionHigh = dayHigh - price <= sessionRange * 0.15;

  if (
    trend === "Strong" &&
    nearSessionHigh &&
    (riskScore ?? 0) >= 60
  ) {
    return "Breakout";
  }

  return "Pullback";
}

function getExitRule(tradeType: TradeSignal["tradeType"]) {
  if (tradeType === "No Trade") return "Avoid until trend and risk improve";
  if (tradeType === "Hold") return "Exit if price closes below invalidation or thesis weakens";
  return "Exit on stop-loss, target, or failed breakout before market close";
}

function getFnoPlan(
  tradeType: TradeSignal["tradeType"],
  confidence: number,
  riskScore: number | null,
) {
  if (tradeType !== "F&O") {
    return "F&O is evaluated only after confirming NSE derivatives eligibility in the trend agent";
  }

  if (confidence >= 72 && (riskScore ?? 0) >= 60) {
    return "Defined-risk option strategy only; avoid naked positions";
  }

  return "No F&O setup";
}

function getReason(
  source: TradeSignal["source"],
  trend: Trend,
  confidence: number,
  volumeScore: number | null,
  riskScore: number | null,
) {
  const provider = source === "zerodha" ? "Zerodha" : "Finnhub";
  const volumeText =
    source === "finnhub" && volumeScore === null
      ? "volume unavailable from the Finnhub quote endpoint"
      : `volume score ${formatScore(volumeScore)}`;

  return `${provider} quote snapshot shows ${trend.toLowerCase()} trend, ${confidence}% confidence, ${volumeText}, and risk score ${formatScore(riskScore)}. Entry, stop and target levels are calculated by Stock Analyzer and are not ${provider} forecasts.`;
}

function formatScore(score: number | null) {
  return score === null ? "pending" : `${score}/100`;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function clamp(value: number) {
  return Math.max(0, Math.min(value, 100));
}

function roundPrice(value: number) {
  return Math.round(value * 20) / 20;
}

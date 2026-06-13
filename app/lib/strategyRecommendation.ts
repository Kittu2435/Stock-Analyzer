import type { AgentPick, StrategyType } from "../types";

type StrategyInput = {
  verdict: AgentPick["verdict"];
  sentiment: AgentPick["sentiment"];
  history: AgentPick["history"];
  signal: AgentPick["signal"];
  latestPublishedAt: string;
  fnoEligible: boolean;
};

export function recommendStrategy(input: StrategyInput): AgentPick["strategy"] {
  const newsAgeHours =
    (Date.now() - new Date(input.latestPublishedAt).getTime()) / 36e5;

  if (
    input.sentiment.evidenceQuality === "Weak" ||
    input.sentiment.explicitEvidenceArticles === 0
  ) {
    return strategy(
      "No Trade",
      "Wait for article-level evidence",
      input.fnoEligible,
      "The available coverage is headline-only or contains no explicit financial event. A headline by itself cannot produce an entry recommendation.",
    );
  }

  if (input.verdict === "Avoid" || input.signal.decision === "Avoid") {
    return strategy(
      "No Trade",
      "Wait for a new setup",
      input.fnoEligible,
      "Current news, historical trend, or quote confirmation is too weak.",
    );
  }

  if (input.history.status === "Unavailable") {
    return strategy(
      "No Trade",
      "Wait for historical confirmation",
      input.fnoEligible,
      "Current news and quote data are visible, but historical trend confirmation is unavailable.",
    );
  }

  if (
    input.fnoEligible &&
    input.verdict === "Consider" &&
    input.signal.trend === "Strong" &&
    input.signal.confidence >= 70 &&
    (input.signal.scores.risk ?? 0) >= 60
  ) {
    return strategy(
      "F&O",
      "Intraday to 5 sessions",
      true,
      "NSE derivatives eligibility is confirmed and sentiment, trend, quote confidence, and risk checks agree. Use defined-risk positions only.",
    );
  }

  if (
    input.verdict === "Consider" &&
    input.signal.trend === "Strong" &&
    input.signal.confidence >= 65 &&
    newsAgeHours <= 24
  ) {
    return strategy(
      "Intraday",
      "Same trading session",
      input.fnoEligible,
      "Fresh positive news and current price strength support a same-session setup if the entry confirmation holds.",
    );
  }

  if (
    input.sentiment.label === "Positive" &&
    input.history.status === "Available" &&
    input.history.trend === "Bullish" &&
    input.history.aboveSma50 === true &&
    (input.history.return60d ?? 0) > 0
  ) {
    return strategy(
      "Long Term",
      "3 months or longer, with periodic review",
      input.fnoEligible,
      "Positive news and bullish medium-term price history agree. Fundamentals are not yet evaluated, so treat this as a long-term review candidate, not an automatic investment.",
    );
  }

  if (
    input.history.trend !== "Bearish" &&
    input.sentiment.label !== "Negative"
  ) {
    return strategy(
      "Swing",
      "2 to 20 trading sessions",
      input.fnoEligible,
      "The setup has some support, but not enough alignment for intraday, F&O, or long-term classification.",
    );
  }

  return strategy(
    "No Trade",
    "Wait for a new setup",
    input.fnoEligible,
    "The available evidence does not support a defined trading horizon.",
  );
}

function strategy(
  type: StrategyType,
  holdingPeriod: string,
  fnoEligible: boolean,
  reason: string,
): AgentPick["strategy"] {
  return {
    type,
    holdingPeriod,
    fnoEligible,
    reason,
  };
}

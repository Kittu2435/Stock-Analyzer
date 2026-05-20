import type { Recommendation, Signal } from "../types";

export function applyRecommendationEngine(signals: Signal[]) {
  return signals.map((signal) => {
    const recommendation = calculateRecommendation(signal);
    const confidence = calculateConfidence(signal, recommendation);

    return {
      ...signal,
      recommendation,
      confidence: `${confidence}%`,
    };
  });
}

function calculateRecommendation(signal: Signal): Recommendation {
  const { fundamentals, news, risk, technical, volume } = signal.scores;
  const trend = signal.marketSnapshot.trend;

  if (risk < 45 || trend === "Weak") {
    return "Avoid";
  }

  if (
    signal.horizon === "Intraday" &&
    news >= 65 &&
    technical >= 70 &&
    volume >= 65 &&
    risk >= 55
  ) {
    return "Intraday pick";
  }

  if (
    signal.horizon === "Hold" &&
    fundamentals >= 70 &&
    news >= 55 &&
    risk >= 60
  ) {
    return "Hold pick";
  }

  return "Watch";
}

function calculateConfidence(signal: Signal, recommendation: Recommendation) {
  const { fundamentals, news, risk, technical, volume } = signal.scores;
  const trendBonus = signal.marketSnapshot.trend === "Strong" ? 4 : 0;
  const trendPenalty = signal.marketSnapshot.trend === "Weak" ? 8 : 0;

  if (recommendation === "Intraday pick") {
    return clamp(
      Math.round(news * 0.3 + technical * 0.3 + volume * 0.25 + risk * 0.15) +
        trendBonus,
    );
  }

  if (recommendation === "Hold pick") {
    return clamp(
      Math.round(
        fundamentals * 0.35 + news * 0.2 + technical * 0.2 + risk * 0.25,
      ) + trendBonus,
    );
  }

  if (recommendation === "Avoid") {
    return clamp(Math.round((100 - risk) * 0.6 + (100 - technical) * 0.4));
  }

  return clamp(
    Math.round(
      news * 0.22 +
        technical * 0.22 +
        volume * 0.18 +
        fundamentals * 0.2 +
        risk * 0.18,
    ) - trendPenalty,
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(value, 100));
}

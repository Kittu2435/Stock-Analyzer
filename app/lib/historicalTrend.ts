import type { AgentPick } from "../types";

export type DailyCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function analyzeHistoricalTrend(
  candles: DailyCandle[],
): AgentPick["history"] {
  if (candles.length < 20) {
    return unavailableHistory("At least 20 daily candles are required.");
  }

  const closes = candles.map((candle) => candle.close);
  const latestClose = closes.at(-1);

  if (!latestClose || latestClose <= 0) {
    return unavailableHistory("Historical candles did not contain a valid close.");
  }

  const sma20 = average(closes.slice(-20));
  const sma50 = candles.length >= 50 ? average(closes.slice(-50)) : null;
  const return20d = calculateReturn(closes, 20);
  const return60d = calculateReturn(closes, 60);
  const aboveSma20 = latestClose > sma20;
  const aboveSma50 = sma50 === null ? null : latestClose > sma50;
  const maxDrawdown60d = calculateMaxDrawdown(closes.slice(-60));
  const bullishChecks = [
    aboveSma20,
    aboveSma50 === true,
    return20d !== null && return20d > 0,
    return60d !== null && return60d > 0,
  ].filter(Boolean).length;
  const bearishChecks = [
    !aboveSma20,
    aboveSma50 === false,
    return20d !== null && return20d < 0,
    return60d !== null && return60d < 0,
  ].filter(Boolean).length;
  const trend =
    bullishChecks >= 3
      ? "Bullish"
      : bearishChecks >= 3
        ? "Bearish"
        : "Neutral";

  return {
    status: "Available",
    trend,
    return20d,
    return60d,
    aboveSma20,
    aboveSma50,
    maxDrawdown60d,
    reason: buildHistoryReason(
      trend,
      return20d,
      return60d,
      aboveSma20,
      aboveSma50,
    ),
  };
}

export function unavailableHistory(reason: string): AgentPick["history"] {
  return {
    status: "Unavailable",
    trend: "Neutral",
    return20d: null,
    return60d: null,
    aboveSma20: null,
    aboveSma50: null,
    maxDrawdown60d: null,
    reason,
  };
}

function calculateReturn(closes: number[], sessions: number) {
  if (closes.length <= sessions) return null;

  const start = closes[closes.length - sessions - 1];
  const end = closes.at(-1);

  if (!start || !end) return null;

  return ((end - start) / start) * 100;
}

function calculateMaxDrawdown(closes: number[]) {
  let peak = closes[0];
  let maxDrawdown = 0;

  for (const close of closes) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, ((close - peak) / peak) * 100);
  }

  return maxDrawdown;
}

function buildHistoryReason(
  trend: AgentPick["history"]["trend"],
  return20d: number | null,
  return60d: number | null,
  aboveSma20: boolean,
  aboveSma50: boolean | null,
) {
  const sma50Text =
    aboveSma50 === null
      ? "50-session average unavailable"
      : `${aboveSma50 ? "above" : "below"} the 50-session average`;

  return `${trend} history: ${formatReturn(return20d)} over 20 sessions, ${formatReturn(return60d)} over 60 sessions, ${aboveSma20 ? "above" : "below"} the 20-session average, and ${sma50Text}.`;
}

function formatReturn(value: number | null) {
  return value === null ? "unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

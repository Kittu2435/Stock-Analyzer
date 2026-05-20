import { NextRequest, NextResponse } from "next/server";
import { signals } from "../../../data";
import { createCustomSignal } from "../../../lib/customSignals";
import { applyRecommendationEngine } from "../../../lib/recommendationEngine";
import type { ResearchBrief } from "../../../types";

type BriefRequest = {
  symbol?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BriefRequest;
  const normalizedSymbol = body.symbol?.trim().toUpperCase() ?? "";

  if (!normalizedSymbol) {
    return NextResponse.json(
      { message: "Symbol is required for research brief." },
      { status: 400 },
    );
  }

  const baseSignal =
    signals.find((item) => item.symbol === normalizedSymbol) ??
    createCustomSignal(normalizedSymbol);
  const signal = applyRecommendationEngine([baseSignal])[0];

  if (!signal) {
    return NextResponse.json(
      { message: "Signal not found for research brief." },
      { status: 404 },
    );
  }

  const scoreValues = Object.values(signal.scores);
  const overallScore = Math.round(
    scoreValues.reduce((total, score) => total + score, 0) / scoreValues.length,
  );

  const warnings = [
    "This is research support, not guaranteed profit advice.",
    "Broker integration should stay manual until auth and risk rules are complete.",
  ];

  if (signal.market === "US") {
    warnings.push(
      "INDmoney US execution is treated as manual until official API access is confirmed.",
    );
  }

  if (signal.fnoView.includes("F&O")) {
    warnings.push(
      "F&O is high risk. Prefer defined-risk strategies over naked option trades.",
    );
  }

  const brief: ResearchBrief = {
    suitableFor: signal.horizon,
    overallScore,
    verdict: signal.recommendation,
    keyReasons: [
      signal.newsCatalyst,
      signal.technicalView,
      signal.volumeView,
      signal.riskView,
    ],
    checks: [
      "News catalyst reviewed",
      "Technical setup reviewed",
      "Volume context reviewed",
      "Fundamental fit reviewed",
      "Risk/invalidation reviewed",
    ],
    warnings,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    signal,
    brief,
  });
}

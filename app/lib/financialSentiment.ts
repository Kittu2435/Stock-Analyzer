import type { AgentPick, TrendHeadline } from "../types";

const positiveEvents = [
  ["beats estimates", "beat estimates"],
  ["profit rises", "profit rose", "profit jumps", "profit jumped"],
  ["revenue grows", "revenue rose", "sales rise", "sales grew"],
  ["raises guidance", "raised guidance", "guidance upgrade"],
  ["order win", "wins order", "secured order", "bags order"],
  ["regulatory approval", "gets approval", "receives approval"],
  ["debt reduction", "cuts debt", "debt falls"],
  ["buyback", "share buyback"],
  ["dividend", "special dividend"],
  ["capacity expansion", "expands capacity", "new plant"],
  ["rating upgrade", "upgraded to buy", "price target raised"],
  ["record profit", "record revenue", "record sales"],
];

const negativeEvents = [
  ["misses estimates", "missed estimates"],
  ["profit falls", "profit fell", "profit drops", "profit declined"],
  ["revenue falls", "sales decline", "sales fell"],
  ["cuts guidance", "guidance cut", "lowers outlook"],
  ["loss widens", "posts loss", "net loss"],
  ["default", "payment default", "debt default"],
  ["fraud", "accounting irregularities", "misconduct"],
  ["probe", "investigation", "regulatory action"],
  ["penalty", "fine imposed"],
  ["rating downgrade", "downgraded to sell", "price target cut"],
  ["plant shutdown", "production halt", "operations suspended"],
  ["order cancelled", "contract terminated"],
];

export function analyzeNewsSentiment(
  headlines: TrendHeadline[],
): AgentPick["sentiment"] {
  let positiveHeadlines = 0;
  let negativeHeadlines = 0;
  let neutralHeadlines = 0;
  const evidence = new Set<string>();

  for (const headline of headlines) {
    const text = normalizeText(headline.title);
    const positiveMatches = matchEvents(text, positiveEvents);
    const negativeMatches = matchEvents(text, negativeEvents);

    positiveMatches.forEach((event) => evidence.add(`Positive: ${event}`));
    negativeMatches.forEach((event) => evidence.add(`Negative: ${event}`));

    if (positiveMatches.length > negativeMatches.length) {
      positiveHeadlines += 1;
    } else if (negativeMatches.length > positiveMatches.length) {
      negativeHeadlines += 1;
    } else {
      neutralHeadlines += 1;
    }
  }

  return {
    label: getSentimentLabel(positiveHeadlines, negativeHeadlines),
    positiveHeadlines,
    negativeHeadlines,
    neutralHeadlines,
    evidence: [...evidence].slice(0, 6),
  };
}

function matchEvents(text: string, eventGroups: string[][]) {
  return eventGroups.flatMap((phrases) => {
    const match = phrases.find((phrase) => text.includes(phrase));
    return match ? [match] : [];
  });
}

function getSentimentLabel(
  positiveHeadlines: number,
  negativeHeadlines: number,
): AgentPick["sentiment"]["label"] {
  if (positiveHeadlines > 0 && negativeHeadlines > 0) return "Mixed";
  if (positiveHeadlines > negativeHeadlines) return "Positive";
  if (negativeHeadlines > positiveHeadlines) return "Negative";
  return "Neutral";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

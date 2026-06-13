import type { AgentPick, TrendHeadline } from "../types";
import type { ArticleEvidence } from "./articleEvidence";

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

const positiveEventPatterns = [
  {
    label: "financial metric improved",
    pattern:
      /\b(revenue|sales|profit|earnings|net income|ebitda|margin|free cash flow)\b.{0,55}\b(beat|beats|exceed|exceeds|grew|grow|growth|rose|rise|rises|increased|improved|rebound|record)\b/,
  },
  {
    label: "financial metric improved",
    pattern:
      /\b(beat|beats|exceed|exceeds|grew|rose|increased|improved|rebounded|record)\b.{0,55}\b(revenue|sales|profit|earnings|net income|ebitda|margin|free cash flow)\b/,
  },
  {
    label: "guidance raised or reaffirmed",
    pattern:
      /\b(raise|raises|raised|increase|increases|increased|reaffirm|reaffirms|reaffirmed)\b.{0,35}\b(guidance|forecast|outlook)\b/,
  },
  {
    label: "contract or order awarded",
    pattern:
      /\b(win|wins|won|secure|secures|secured|award|awarded|receive|receives|received)\b.{0,45}\b(contract|order|tender)\b/,
  },
  {
    label: "regulatory approval received",
    pattern:
      /\b(approval|approved|clearance|cleared|authorization|authorized)\b.{0,35}\b(regulator|regulatory|fda|sebi|rbi|government|commission)?\b/,
  },
  {
    label: "analyst upgrade",
    pattern:
      /\b(upgrade|upgraded|raises? price target|price target raised|initiates? with (buy|outperform|overweight))\b/,
  },
];

const negativeEventPatterns = [
  {
    label: "financial metric weakened",
    pattern:
      /\b(revenue|sales|profit|earnings|net income|ebitda|margin|free cash flow)\b.{0,55}\b(miss|misses|missed|fell|fall|falls|declined|decline|declines|dropped|drop|drops|weakened|contracted|loss)\b/,
  },
  {
    label: "financial metric weakened",
    pattern:
      /\b(miss|misses|missed|fell|declined|dropped|weakened|contracted)\b.{0,55}\b(revenue|sales|profit|earnings|net income|ebitda|margin|free cash flow)\b/,
  },
  {
    label: "guidance lowered or withdrawn",
    pattern:
      /\b(cut|cuts|cutting|lower|lowers|lowered|withdraw|withdraws|withdrew|suspend|suspends|suspended)\b.{0,35}\b(guidance|forecast|outlook)\b/,
  },
  {
    label: "dilution or capital raise",
    pattern:
      /\b(capital raise|share offering|stock offering|secondary offering|equity offering|dilution|dilutive)\b/,
  },
  {
    label: "legal or regulatory risk",
    pattern:
      /\b(investigation|probe|lawsuit|fraud|misconduct|regulatory action|penalty|fine|recall|data breach|cyberattack)\b/,
  },
  {
    label: "financial distress",
    pattern:
      /\b(default|bankruptcy|insolvency|liquidity crisis|going concern|debt restructuring)\b/,
  },
  {
    label: "analyst downgrade",
    pattern:
      /\b(downgrade|downgraded|cuts? price target|price target cut|initiates? with (sell|underperform|underweight))\b/,
  },
];

export function analyzeNewsSentiment(
  headlines: TrendHeadline[],
  evidenceByLink = new Map<string, ArticleEvidence>(),
  subjectTerms: string[] = [],
): AgentPick["sentiment"] {
  let positiveHeadlines = 0;
  let negativeHeadlines = 0;
  let neutralHeadlines = 0;
  let fullTextArticles = 0;
  let summaryArticles = 0;
  let headlineOnlyArticles = 0;
  let explicitEvidenceArticles = 0;
  const evidence = new Set<string>();

  for (const headline of headlines) {
    const articleEvidence =
      evidenceByLink.get(headline.link) ?? fallbackEvidence(headline);
    const relevantText = getSubjectRelevantText(
      articleEvidence.text,
      headline.title,
      subjectTerms,
    );
    const text = normalizeText(relevantText);
    const positiveMatches = [
      ...matchEvents(text, positiveEvents),
      ...matchPatternEvents(text, positiveEventPatterns),
    ];
    const negativeMatches = [
      ...matchEvents(text, negativeEvents),
      ...matchPatternEvents(text, negativeEventPatterns),
    ];

    if (articleEvidence.depth === "Full article") {
      fullTextArticles += 1;
    } else if (articleEvidence.depth === "Summary") {
      summaryArticles += 1;
    } else {
      headlineOnlyArticles += 1;
    }

    if (
      articleEvidence.depth !== "Headline only" &&
      positiveMatches.length + negativeMatches.length > 0
    ) {
      explicitEvidenceArticles += 1;
    }

    positiveMatches.forEach((event) =>
      evidence.add(
        formatEvidence(
          "Positive",
          event,
          headline,
          { ...articleEvidence, text: relevantText },
        ),
      ),
    );
    negativeMatches.forEach((event) =>
      evidence.add(
        formatEvidence(
          "Negative",
          event,
          headline,
          { ...articleEvidence, text: relevantText },
        ),
      ),
    );

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
    fullTextArticles,
    summaryArticles,
    headlineOnlyArticles,
    explicitEvidenceArticles,
    evidenceQuality: getEvidenceQuality(
      headlines,
      fullTextArticles,
      summaryArticles,
      explicitEvidenceArticles,
    ),
    evidence: [...evidence].slice(0, 6),
  };
}

function fallbackEvidence(headline: TrendHeadline): ArticleEvidence {
  const summary = headline.summary?.trim();
  const text = summary ? `${headline.title}. ${summary}` : headline.title;

  return {
    depth: summary ? "Summary" : "Headline only",
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

function formatEvidence(
  direction: "Positive" | "Negative",
  event: string,
  headline: TrendHeadline,
  articleEvidence: ArticleEvidence,
) {
  const snippet = getEvidenceSnippet(articleEvidence.text, event);

  return `${direction} (${articleEvidence.depth}, ${headline.source}): ${snippet}`;
}

function getEvidenceSnippet(text: string, event: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const matchedSentence =
    sentences.find((sentence) =>
      normalizeText(sentence).includes(event),
    ) ?? event;

  return matchedSentence.length > 180
    ? `${matchedSentence.slice(0, 177).trim()}...`
    : matchedSentence;
}

function getEvidenceQuality(
  headlines: TrendHeadline[],
  fullTextArticles: number,
  summaryArticles: number,
  explicitEvidenceArticles: number,
): AgentPick["sentiment"]["evidenceQuality"] {
  const sourceCount = new Set(headlines.map((headline) => headline.source)).size;
  const articleLevelCount = fullTextArticles + summaryArticles;

  if (
    explicitEvidenceArticles >= 2 &&
    articleLevelCount >= 2 &&
    sourceCount >= 2
  ) {
    return "Strong";
  }

  if (explicitEvidenceArticles >= 1 && articleLevelCount >= 1) {
    return "Moderate";
  }

  return "Weak";
}

function matchEvents(text: string, eventGroups: string[][]) {
  return eventGroups.flatMap((phrases) => {
    const match = phrases.find((phrase) => text.includes(phrase));
    return match ? [match] : [];
  });
}

function matchPatternEvents(
  text: string,
  rules: Array<{ label: string; pattern: RegExp }>,
) {
  return rules.flatMap((rule) => (rule.pattern.test(text) ? [rule.label] : []));
}

function getSubjectRelevantText(
  articleText: string,
  title: string,
  subjectTerms: string[],
) {
  const normalizedTerms = subjectTerms
    .map(normalizeText)
    .filter((term) => term.length >= 2);

  if (normalizedTerms.length === 0) return articleText;

  const sentences = articleText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const relevantIndexes = new Set<number>();

  sentences.forEach((sentence, index) => {
    const normalizedSentence = normalizeText(sentence);

    if (normalizedTerms.some((term) => normalizedSentence.includes(term))) {
      relevantIndexes.add(index);
      if (index > 0) relevantIndexes.add(index - 1);
      if (index + 1 < sentences.length) relevantIndexes.add(index + 1);
    }
  });

  const relevantSentences = [...relevantIndexes]
    .sort((first, second) => first - second)
    .map((index) => sentences[index]);

  return relevantSentences.length > 0
    ? `${title}. ${relevantSentences.join(" ")}`
    : title;
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

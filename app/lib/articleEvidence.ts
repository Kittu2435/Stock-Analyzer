import "server-only";

import { load } from "cheerio";
import type { TrendHeadline } from "../types";

export type ArticleEvidence = {
  depth: NonNullable<TrendHeadline["analysisDepth"]>;
  text: string;
  wordCount: number;
};

const minimumArticleWords = 120;
const minimumSummaryWords = 20;
const maximumArticleCharacters = 60_000;
const requestTimeoutMilliseconds = 7_000;

export async function enrichHeadlineEvidence(
  headlines: TrendHeadline[],
  maximumArticleFetches = 12,
) {
  const evidenceByLink = new Map<string, ArticleEvidence>();
  const uniqueHeadlines = new Map<string, TrendHeadline>();

  for (const headline of headlines) {
    uniqueHeadlines.set(headline.link, headline);
    evidenceByLink.set(headline.link, fallbackEvidence(headline));
  }

  const fetchQueue = [...uniqueHeadlines.values()]
    .sort(
      (first, second) =>
        new Date(second.publishedAt ?? 0).getTime() -
        new Date(first.publishedAt ?? 0).getTime(),
    )
    .slice(0, maximumArticleFetches);

  await runWithConcurrency(fetchQueue, 4, async (headline) => {
    const articleText = await fetchPublicArticleText(headline.link);

    if (countWords(articleText) >= minimumArticleWords) {
      evidenceByLink.set(headline.link, {
        depth: "Full article",
        text: articleText,
        wordCount: countWords(articleText),
      });
    }
  });

  return {
    evidenceByLink,
    headlines: headlines.map((headline) => {
      const evidence = evidenceByLink.get(headline.link) ?? fallbackEvidence(headline);

      return {
        ...headline,
        analysisDepth: evidence.depth,
        analyzedWordCount: evidence.wordCount,
      };
    }),
  };
}

export function htmlToPlainText(value?: string | null) {
  if (!value) return "";

  const document = load(value);
  document("script, style, noscript").remove();

  return normalizeText(document.root().text());
}

async function fetchPublicArticleText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    requestTimeoutMilliseconds,
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; StockAnalyzer/1.0; public market research)",
      },
    });

    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return "";

    return extractArticleText(await response.text());
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractArticleText(html: string) {
  const document = load(html);
  const structuredArticle = getStructuredArticleBody(document);

  if (countWords(structuredArticle) >= minimumArticleWords) {
    return structuredArticle.slice(0, maximumArticleCharacters);
  }

  document(
    "script, style, noscript, nav, header, footer, aside, form, button, iframe",
  ).remove();
  const selectors = [
    "[itemprop='articleBody'] p",
    "article p",
    "main p",
    ".article-body p",
    ".article__body p",
    ".story-body p",
    ".story-content p",
    ".content-body p",
  ];

  for (const selector of selectors) {
    const paragraphs = document(selector)
      .toArray()
      .map((element) => normalizeText(document(element).text()))
      .filter((paragraph) => countWords(paragraph) >= 8);
    const text = deduplicateParagraphs(paragraphs).join(" ");

    if (countWords(text) >= minimumArticleWords) {
      return text.slice(0, maximumArticleCharacters);
    }
  }

  return "";
}

function getStructuredArticleBody(document: ReturnType<typeof load>) {
  const bodies: string[] = [];

  document("script[type='application/ld+json']").each((_, element) => {
    const rawJson = document(element).text().trim();
    if (!rawJson) return;

    try {
      collectArticleBodies(JSON.parse(rawJson), bodies);
    } catch {
      // Invalid publisher metadata should not prevent other extraction methods.
    }
  });

  return normalizeText(bodies.sort((a, b) => b.length - a.length)[0] ?? "");
}

function collectArticleBodies(value: unknown, bodies: string[]) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectArticleBodies(item, bodies));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "articleBody" && typeof nestedValue === "string") {
      bodies.push(nestedValue);
    } else if (nestedValue && typeof nestedValue === "object") {
      collectArticleBodies(nestedValue, bodies);
    }
  }
}

function fallbackEvidence(headline: TrendHeadline): ArticleEvidence {
  const summary = normalizeText(headline.summary ?? "");

  if (countWords(summary) >= minimumSummaryWords) {
    const text = normalizeText(`${headline.title}. ${summary}`);

    return {
      depth: "Summary",
      text,
      wordCount: countWords(text),
    };
  }

  return {
    depth: "Headline only",
    text: normalizeText(headline.title),
    wordCount: countWords(headline.title),
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
}

function deduplicateParagraphs(paragraphs: string[]) {
  return [...new Set(paragraphs)];
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function countWords(value: string) {
  return value ? value.split(/\s+/).filter(Boolean).length : 0;
}

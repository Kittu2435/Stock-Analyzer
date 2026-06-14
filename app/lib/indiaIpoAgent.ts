import "server-only";

import type {
  AgentPick,
  IndiaIpoCandidate,
  TrendHeadline,
} from "../types";
import {
  enrichHeadlineEvidence,
  type ArticleEvidence,
} from "./articleEvidence";
import { analyzeNewsSentiment } from "./financialSentiment";
import {
  fetchMarketHeadlines,
  type IndiaNewsBatch,
} from "./marketTrendAgent";

type NseIpoIssue = {
  companyName?: unknown;
  company?: unknown;
  issueEndDate?: unknown;
  issuePrice?: unknown;
  issueSize?: unknown;
  issueStartDate?: unknown;
  lotSize?: unknown;
  priceBand?: unknown;
  series?: unknown;
  status?: unknown;
  symbol?: unknown;
};

type NseOfferDocument = {
  company?: unknown;
  drhpAttach?: unknown;
  drhpStatus?: unknown;
  fpAttach?: unknown;
  ipo_abridged_prospectus_xbrl_link?: unknown;
  pan_no?: unknown;
  rhpAttach?: unknown;
};

type NormalizedIpoIssue = {
  category: IndiaIpoCandidate["category"];
  companyName: string;
  issueEndDate: string | null;
  issueSizeShares: number | null;
  issueStartDate: string | null;
  lotSize: number | null;
  priceBand: string | null;
  series: string;
  status: string;
  symbol: string;
  upperPrice: number | null;
};

type CompanyAnalysis = IndiaIpoCandidate["companyAnalysis"];

const nseIpoPage =
  "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
const nseOfferDocumentsPage =
  "https://www.nseindia.com/companies-listing/corporate-filings-offer-documents";
const nseBaseUrl = "https://www.nseindia.com";
const nseUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

const prospectusSections = [
  { key: "BusinessOverviewAndStrategy140Response", label: "Business", type: "BOAS" },
  { key: "ObjectsOfTheIssue170Response", label: "Issue objects", type: "OBJ_ISSUE" },
  { key: "RestatedConsolidatedAudited210Response", label: "Audited financials", type: "RCA" },
  { key: "Litigations220Response", label: "Litigation", type: "LITIGATION" },
  { key: "RegulatoryAction240Response", label: "Regulatory actions", type: "REGULATORY" },
] as const;

export async function runIndiaIpoAgent(newsOverride?: IndiaNewsBatch) {
  const [ipoBatch, newsBatch] = await Promise.all([
    fetchNseIpoData(),
    newsOverride ? Promise.resolve(newsOverride) : fetchMarketHeadlines(),
  ]);
  const matches = ipoBatch.issues.map((issue) => ({
    issue,
    headlines: findIpoHeadlines(issue, newsBatch.headlines),
  }));
  const enriched = await enrichHeadlineEvidence(
    matches.flatMap((match) => match.headlines),
    8,
  );
  const headlineByLink = new Map(
    enriched.headlines.map((headline) => [headline.link, headline]),
  );
  const companyAnalysisBySymbol = await loadCompanyAnalyses(
    ipoBatch.issues,
    ipoBatch.offerDocuments,
    ipoBatch.headers,
  );
  const ipos = matches
    .map(({ issue, headlines }) =>
      buildIpoCandidate(
        issue,
        headlines.map(
          (headline) => headlineByLink.get(headline.link) ?? headline,
        ),
        enriched.evidenceByLink,
        companyAnalysisBySymbol.get(issue.symbol) ?? emptyCompanyAnalysis(),
      ),
    )
    .sort(compareIpos);

  return {
    generatedAt: new Date().toISOString(),
    ipos,
    sources: [
      "NSE India IPO",
      "NSE offer documents",
      ...newsBatch.sources,
    ],
    message:
      ipos.length > 0
        ? undefined
        : ipoBatch.available
          ? "NSE currently reports no open or forthcoming IPO issues."
          : "The official NSE IPO source is temporarily unavailable.",
  };
}

async function fetchNseIpoData() {
  try {
    const landingResponse = await fetch(nseIpoPage, {
      cache: "no-store",
      headers: getLandingHeaders(),
    });
    const headers = getNseApiHeaders(getResponseCookies(landingResponse));
    const [currentResult, upcomingResult, equityDocsResult, smeDocsResult] =
      await Promise.allSettled([
        fetchJson(`${nseBaseUrl}/api/ipo-current-issue`, headers),
        fetchJson(
          `${nseBaseUrl}/api/all-upcoming-issues?category=ipo`,
          headers,
        ),
        fetchJson(
          `${nseBaseUrl}/api/corporates/offerdocs?index=equities`,
          headers,
        ),
        fetchJson(
          `${nseBaseUrl}/api/corporates/offerdocs?index=sme`,
          headers,
        ),
      ]);
    const current =
      currentResult.status === "fulfilled" ? currentResult.value : [];
    const upcoming =
      upcomingResult.status === "fulfilled" ? upcomingResult.value : [];
    const issues = [
      ...parseIssueArray(current).map((issue) =>
        normalizeIssue(issue, "Open now"),
      ),
      ...parseIssueArray(upcoming).map((issue) =>
        normalizeIssue(issue, "Upcoming"),
      ),
    ]
      .filter((issue): issue is NormalizedIpoIssue => Boolean(issue))
      .filter(
        (issue, index, allIssues) =>
          allIssues.findIndex(
            (candidate) =>
              candidate.symbol === issue.symbol &&
              candidate.issueStartDate === issue.issueStartDate,
          ) === index,
      );
    const offerDocuments = [
      ...(equityDocsResult.status === "fulfilled"
        ? parseObjectArray(equityDocsResult.value)
        : []),
      ...(smeDocsResult.status === "fulfilled"
        ? parseObjectArray(smeDocsResult.value)
        : []),
    ] as NseOfferDocument[];

    return {
      available:
        currentResult.status === "fulfilled" ||
        upcomingResult.status === "fulfilled",
      headers,
      issues,
      offerDocuments,
    };
  } catch (error) {
    console.error("Unable to load NSE IPO issues:", error);
    return {
      available: false,
      headers: getNseApiHeaders(""),
      issues: [] as NormalizedIpoIssue[],
      offerDocuments: [] as NseOfferDocument[],
    };
  }
}

async function loadCompanyAnalyses(
  issues: NormalizedIpoIssue[],
  offerDocuments: NseOfferDocument[],
  headers: Record<string, string>,
) {
  const entries = await Promise.all(
    issues.slice(0, 10).map(async (issue) => {
      const offerDocument = findOfferDocument(issue, offerDocuments);
      const analysis = offerDocument
        ? await fetchCompanyAnalysis(offerDocument, headers)
        : emptyCompanyAnalysis();

      return [issue.symbol, analysis] as const;
    }),
  );

  return new Map(entries);
}

async function fetchCompanyAnalysis(
  document: NseOfferDocument,
  headers: Record<string, string>,
): Promise<CompanyAnalysis> {
  const pan = getString(document.pan_no);
  const links = {
    abridgedProspectusUrl: getDocumentUrl(
      document.ipo_abridged_prospectus_xbrl_link,
    ),
    drhpUrl: getDocumentUrl(document.drhpAttach),
    finalProspectusUrl: getDocumentUrl(document.fpAttach),
    rhpUrl: getDocumentUrl(document.rhpAttach),
  };

  if (!pan) {
    return {
      ...emptyCompanyAnalysis(),
      ...links,
      coverage: Object.values(links).some(Boolean) ? "Partial" : "Unavailable",
      documentStatus: getString(document.drhpStatus) || "Document listed",
    };
  }

  const sectionResults = await Promise.allSettled(
    prospectusSections.map(async (section) => {
      const data = await fetchJson(
        `${nseBaseUrl}/api/offer-documents-abridged-prospectus?pan_no=${encodeURIComponent(pan)}&type=${section.type}`,
        headers,
      );
      return {
        ...section,
        rows: getResponseRows(data, section.key),
      };
    }),
  );
  const sections = sectionResults.flatMap((result) =>
    result.status === "fulfilled" && result.value.rows.length > 0
      ? [result.value]
      : [],
  );
  const getRows = (type: string) =>
    sections.find((section) => section.type === type)?.rows ?? [];
  const business = getRows("BOAS")[0];
  const financial = getRows("RCA")[0];
  const objects = getRows("OBJ_ISSUE");
  const litigation = getRows("LITIGATION");
  const regulatory = getRows("REGULATORY")[0];
  const profitable = getProfitability(financial);
  const issueObjects = objects
    .map((row) => displayValue(row.objectsOfTheIssue))
    .filter((value): value is string => Boolean(value));
  const litigationSummary = summarizeLitigation(litigation);
  const regulatorySummary = summarizeRegulatory(regulatory);
  const concerns = getCompanyConcerns(
    profitable,
    issueObjects,
    litigationSummary,
    regulatorySummary,
  );
  const positives = getCompanyPositives(
    profitable,
    financial,
    links,
    sections.map((section) => section.label),
  );
  const requiredSections = ["RCA", "OBJ_ISSUE", "LITIGATION", "REGULATORY"];
  const hasRequiredSections = requiredSections.every((type) =>
    sections.some((section) => section.type === type),
  );
  const hasFinalDocument = Boolean(
    links.rhpUrl ||
      links.finalProspectusUrl ||
      links.abridgedProspectusUrl,
  );

  return {
    coverage:
      hasRequiredSections && hasFinalDocument
        ? "Complete"
        : sections.length > 0 || Object.values(links).some(Boolean)
          ? "Partial"
          : "Unavailable",
    sections: sections.map((section) => section.label),
    documentStatus: getString(document.drhpStatus) || "Document listed",
    ...links,
    businessOverview:
      displayValue(business?.overviewOfTheCompany) ||
      displayValue(business?.productOrServiceOfferingOfTheCompany),
    issueObjects,
    financials: {
      totalIncome: displayValue(financial?.totalIncomeFromOperations),
      profitAfterTax: displayValue(financial?.profAfterItemsAndTax),
      netWorth: displayValue(financial?.netWorth),
      returnOnNetWorth: displayValue(financial?.returnOnNetWorth),
      basicEps: displayValue(financial?.basicLossPerShare),
      profitable,
    },
    litigationSummary,
    regulatorySummary,
    positives,
    concerns,
  };
}

function buildIpoCandidate(
  issue: NormalizedIpoIssue,
  headlines: TrendHeadline[],
  evidenceByLink: Map<string, ArticleEvidence>,
  companyAnalysis: CompanyAnalysis,
): IndiaIpoCandidate {
  const sentiment = analyzeNewsSentiment(
    headlines,
    evidenceByLink,
    [issue.symbol, issue.companyName],
  );
  const sourceCount = new Set(headlines.map((headline) => headline.source)).size;
  const minimumInvestment =
    issue.upperPrice && issue.lotSize
      ? issue.upperPrice * issue.lotSize
      : null;
  const verdict = getIpoVerdict(
    issue,
    sentiment,
    sourceCount,
    companyAnalysis,
  );
  const assessment = getIpoAssessment(
    issue,
    sentiment,
    sourceCount,
    minimumInvestment,
    companyAnalysis,
    verdict,
  );

  return {
    category: issue.category,
    companyName: issue.companyName,
    symbol: issue.symbol,
    series: issue.series,
    status: issue.status,
    issueStartDate: issue.issueStartDate,
    issueEndDate: issue.issueEndDate,
    priceBand: issue.priceBand,
    issueSizeShares: issue.issueSizeShares,
    lotSize: issue.lotSize,
    minimumInvestment,
    verdict,
    reason: getIpoReason(
      issue,
      sentiment,
      sourceCount,
      verdict,
      companyAnalysis,
    ),
    listingGainEstimate:
      "Not forecast. Official filings do not provide a reliable future listing price.",
    riskFlags: getRiskFlags(
      issue,
      sentiment,
      sourceCount,
      minimumInvestment,
      companyAnalysis,
    ),
    sourceUrl: nseOfferDocumentsPage,
    sourceCount,
    sentiment,
    headlines: sortHeadlinesNewestFirst(headlines).slice(0, 3),
    assessment,
    companyAnalysis,
  };
}

function getIpoAssessment(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  minimumInvestment: number | null,
  analysis: CompanyAnalysis,
  verdict: IndiaIpoCandidate["verdict"],
): IndiaIpoCandidate["assessment"] {
  const netWorth = getNumericValue(analysis.financials.netWorth);
  const eps = getNumericValue(analysis.financials.basicEps);
  const impliedPe =
    issue.upperPrice && eps && eps > 0 ? issue.upperPrice / eps : null;
  const hasIssueObjects = analysis.issueObjects.length > 0;
  const generalPurposeOnly =
    hasIssueObjects &&
    analysis.issueObjects.every((value) =>
      /general corporate purposes/i.test(value),
    );
  const adverseLitigation = Boolean(
    analysis.litigationSummary &&
      !isBenignDisclosure(analysis.litigationSummary),
  );
  const adverseRegulatory = Boolean(
    analysis.regulatorySummary &&
      hasAdverseRegulatoryText(analysis.regulatorySummary),
  );
  const hasNewsConfirmation =
    sentiment.explicitEvidenceArticles > 0 &&
    sourceCount > 0 &&
    sentiment.label !== "Negative";
  const isSme = issue.series.toUpperCase().includes("SME");
  const metrics: IndiaIpoCandidate["assessment"]["metrics"] = [
    {
      label: "Issue availability",
      status: issue.category === "Open now" ? "Pass" : "Pending",
      value:
        issue.category === "Open now"
          ? "Open for application"
          : `Opens ${issue.issueStartDate ?? "on a date not yet published"}`,
      consideration:
        issue.category === "Open now"
          ? "An application decision can be made during the issue window."
          : "Upcoming issues remain Wait until the subscription window opens.",
      required: true,
    },
    {
      label: "Official filing coverage",
      status: analysis.coverage === "Complete" ? "Pass" : "Missing",
      value: `${analysis.coverage}; ${analysis.sections.length} structured sections`,
      consideration:
        analysis.coverage === "Complete"
          ? "Final or abridged documents and the required structured sections are available."
          : "A DRHP alone is not enough. Audited financials, issue objects, litigation and regulatory sections are required.",
      required: true,
    },
    {
      label: "Profitability",
      status:
        analysis.financials.profitable === true
          ? "Pass"
          : analysis.financials.profitable === false
            ? "Concern"
            : "Missing",
      value:
        analysis.financials.profitAfterTax ??
        "Profit after tax not available",
      consideration:
        analysis.financials.profitable === true
          ? "The latest structured filing reports positive profit after tax."
          : analysis.financials.profitable === false
            ? "A latest-period loss is a rejection condition in the current rules."
            : "Profitability cannot be assessed without usable audited values.",
      required: true,
    },
    {
      label: "Net worth",
      status:
        netWorth === null ? "Missing" : netWorth > 0 ? "Pass" : "Concern",
      value: analysis.financials.netWorth ?? "Net worth not available",
      consideration:
        netWorth === null
          ? "Positive net worth must be confirmed from the official filing."
          : netWorth > 0
            ? "The latest structured filing reports positive net worth."
            : "Zero or negative net worth is a material balance-sheet concern.",
      required: true,
    },
    {
      label: "Use of IPO proceeds",
      status: !hasIssueObjects
        ? "Missing"
        : generalPurposeOnly
          ? "Concern"
          : "Pass",
      value: hasIssueObjects
        ? analysis.issueObjects.join("; ")
        : "Issue objects not available",
      consideration: !hasIssueObjects
        ? "The intended use of investor funds must be disclosed."
        : generalPurposeOnly
          ? "Only general corporate purposes are disclosed, providing limited specificity."
          : "A specific disclosed use of proceeds is available for review.",
      required: true,
    },
    {
      label: "Litigation",
      status: analysis.litigationSummary
        ? adverseLitigation
          ? "Concern"
          : "Pass"
        : "Missing",
      value: analysis.litigationSummary ?? "Structured disclosure unavailable",
      consideration: adverseLitigation
        ? "Disclosed litigation and amounts need manual review before applying."
        : analysis.litigationSummary
          ? "No adverse litigation signal was extracted from the structured disclosure."
          : "The litigation section must be available before an Apply decision.",
      required: true,
    },
    {
      label: "Regulatory and promoter record",
      status: analysis.regulatorySummary
        ? adverseRegulatory
          ? "Concern"
          : "Pass"
        : "Missing",
      value: analysis.regulatorySummary ?? "Structured disclosure unavailable",
      consideration: adverseRegulatory
        ? "Adverse regulatory or criminal disclosure is a rejection condition."
        : analysis.regulatorySummary
          ? "No adverse regulatory signal was extracted from the structured disclosure."
          : "The regulatory section must be available before an Apply decision.",
      required: true,
    },
    {
      label: "Independent news confirmation",
      status:
        sentiment.label === "Negative"
          ? "Concern"
          : hasNewsConfirmation
            ? "Pass"
            : "Missing",
      value: `${sentiment.explicitEvidenceArticles} evidence articles from ${sourceCount} sources; ${sentiment.label}`,
      consideration:
        sentiment.label === "Negative"
          ? "Recent negative financial evidence is a rejection condition."
          : hasNewsConfirmation
            ? "Recent article-level evidence independently supports the company review."
            : isSme
              ? "At least one explicit independent article is required for an SME Apply decision."
              : "News is corroborating evidence; the official filing remains primary for mainboard issues.",
      required: isSme,
    },
    {
      label: "Indicative valuation",
      status: impliedPe === null ? "Missing" : "Information",
      value:
        impliedPe === null
          ? "P/E cannot be calculated from available values"
          : `Upper price / reported EPS: ${impliedPe.toFixed(2)}x`,
      consideration:
        "This is informational only until comparable listed-company valuation data is available.",
      required: false,
    },
    {
      label: "Liquidity and application exposure",
      status:
        isSme || (minimumInvestment !== null && minimumInvestment >= 100_000)
          ? "Concern"
          : "Information",
      value: `${issue.series}; minimum ${
        minimumInvestment === null
          ? "not available"
          : `INR ${minimumInvestment.toLocaleString("en-IN")}`
      }`,
      consideration: isSme
        ? "SME issues can have higher lot concentration, lower liquidity and wider spreads after listing."
        : "Review the minimum application against personal position-size limits.",
      required: false,
    },
  ];
  const requiredMetrics = metrics.filter((metric) => metric.required);
  const blockingReasons = requiredMetrics
    .filter((metric) => metric.status !== "Pass")
    .map((metric) => `${metric.label}: ${metric.consideration}`);

  return {
    decision:
      verdict === "Consider applying"
        ? "Apply"
        : verdict === "Avoid"
          ? "Do not apply"
          : "Wait",
    passedRequiredChecks: requiredMetrics.filter(
      (metric) => metric.status === "Pass",
    ).length,
    totalRequiredChecks: requiredMetrics.length,
    blockingReasons,
    metrics,
  };
}

function getIpoVerdict(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  analysis: CompanyAnalysis,
): IndiaIpoCandidate["verdict"] {
  const netWorth = getNumericValue(analysis.financials.netWorth);
  const hasIssueObjects = analysis.issueObjects.length > 0;
  const generalPurposeOnly =
    hasIssueObjects &&
    analysis.issueObjects.every((value) =>
      /general corporate purposes/i.test(value),
    );
  const adverseLitigation = Boolean(
    analysis.litigationSummary &&
      !isBenignDisclosure(analysis.litigationSummary),
  );
  const adverseRegulatory = Boolean(
    analysis.regulatorySummary &&
      hasAdverseRegulatoryText(analysis.regulatorySummary),
  );

  if (
    sentiment.label === "Negative" ||
    analysis.financials.profitable === false ||
    adverseRegulatory
  ) {
    return "Avoid";
  }

  if (analysis.coverage !== "Complete") return "Insufficient evidence";
  if (issue.category === "Upcoming") return "Watch";
  if (
    analysis.financials.profitable === null ||
    netWorth === null ||
    !hasIssueObjects ||
    !analysis.litigationSummary ||
    !analysis.regulatorySummary
  ) {
    return "Insufficient evidence";
  }
  if (netWorth <= 0 || generalPurposeOnly || adverseLitigation) return "Watch";

  const isSme = issue.series.toUpperCase().includes("SME");
  if (isSme && (sourceCount < 1 || sentiment.explicitEvidenceArticles === 0)) {
    return "Watch";
  }

  return analysis.financials.profitable === true
    ? "Consider applying"
    : "Watch";
}

function getRiskFlags(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  minimumInvestment: number | null,
  analysis: CompanyAnalysis,
) {
  const flags = [
    "No listed price history exists before trading begins.",
    "Allotment and listing gains are not guaranteed.",
    ...analysis.concerns,
  ];

  if (issue.series.toUpperCase().includes("SME")) {
    flags.push("SME liquidity, spread, and lot-size risk can be higher.");
  }
  if (minimumInvestment !== null && minimumInvestment >= 100_000) {
    flags.push("The minimum application creates concentrated exposure.");
  }
  if (analysis.coverage !== "Complete") {
    flags.push("Official company-analysis coverage is incomplete.");
  }
  if (sentiment.evidenceQuality === "Weak") {
    flags.push("Recent article-level evidence is limited.");
  }
  if (sourceCount < 2) {
    flags.push("Independent news-source confirmation is limited.");
  }

  return [...new Set(flags)];
}

function getIpoReason(
  issue: NormalizedIpoIssue,
  sentiment: AgentPick["sentiment"],
  sourceCount: number,
  verdict: IndiaIpoCandidate["verdict"],
  analysis: CompanyAnalysis,
) {
  const timing =
    issue.category === "Open now"
      ? "The issue is currently open."
      : "The issue is upcoming, so the final application decision should wait until it opens.";
  const coverage =
    analysis.coverage === "Complete"
      ? `Official NSE prospectus coverage includes ${analysis.sections.join(", ")}.`
      : `Official company coverage is ${analysis.coverage.toLowerCase()}; a DRHP alone is not treated as complete investment evidence.`;

  return `${verdict}. ${timing} ${coverage} The company is ${analysis.financials.profitable === true ? "profitable in the latest structured filing" : analysis.financials.profitable === false ? "loss-making in the latest structured filing" : "missing usable structured profitability data"}. Recent coverage includes ${headlinesText(sentiment, sourceCount)}.`;
}

function getCompanyPositives(
  profitable: boolean | null,
  financial: Record<string, unknown> | undefined,
  links: {
    abridgedProspectusUrl: string | null;
    drhpUrl: string | null;
    finalProspectusUrl: string | null;
    rhpUrl: string | null;
  },
  sections: string[],
) {
  const positives: string[] = [];

  if (profitable === true) positives.push("Latest structured filing reports profit after tax.");
  if ((getNumericValue(financial?.netWorth) ?? 0) > 0) {
    positives.push("Latest structured filing reports positive net worth.");
  }
  if (links.rhpUrl || links.finalProspectusUrl || links.abridgedProspectusUrl) {
    positives.push("A final or abridged official offer document is available.");
  }
  if (sections.length >= 4) {
    positives.push("NSE provides broad structured company disclosure coverage.");
  }

  return positives;
}

function getCompanyConcerns(
  profitable: boolean | null,
  issueObjects: string[],
  litigationSummary: string | null,
  regulatorySummary: string | null,
) {
  const concerns: string[] = [];

  if (profitable === false) {
    concerns.push("Latest structured filing reports a loss after tax.");
  }
  if (
    issueObjects.length > 0 &&
    issueObjects.every((value) => /general corporate purposes/i.test(value))
  ) {
    concerns.push("The disclosed issue use is limited to general corporate purposes.");
  }
  if (litigationSummary && !isBenignDisclosure(litigationSummary)) {
    concerns.push("The prospectus discloses litigation; review the amount and status.");
  }
  if (regulatorySummary && hasAdverseRegulatoryText(regulatorySummary)) {
    concerns.push("Adverse regulatory or criminal disclosure requires review.");
  }

  return concerns;
}

function summarizeLitigation(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return null;

  const amounts = rows
    .map((row) => getNumericValue(row.aggregateAmountInvolved))
    .filter((value): value is number => value !== null);
  const descriptions = rows.flatMap((row) =>
    [
      ["Criminal proceedings", displayValue(row.criminalProceedings)],
      ["Tax proceedings", displayValue(row.taxProceedings)],
      [
        "Statutory or regulatory proceedings",
        displayValue(row.statutoryOrRegulatoryProceedings),
      ],
      [
        "SEBI or exchange disciplinary actions",
        displayValue(row.disciplinaryActionsByTheSEBI),
      ],
      ["Material civil litigation", displayValue(row.materialCivilLitigations)],
    ].flatMap(([label, value]) => (value ? [`${label}: ${value}`] : [])),
  );
  const amountText =
    amounts.length > 0
      ? ` Aggregate amount values reported: ${amounts.join(", ")}.`
      : "";

  return `${[...new Set(descriptions)].join("; ")}${amountText}`.trim() || null;
}

function summarizeRegulatory(row: Record<string, unknown> | undefined) {
  if (!row) return null;

  return [
    displayValue(row.disciplinaryActionTakenBySEBI),
    displayValue(row.briefDetailsOfCriminalProceedings),
    displayValue(row.anyOtherImpInfoAsPerBRLM),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim() || null;
}

function findOfferDocument(
  issue: NormalizedIpoIssue,
  documents: NseOfferDocument[],
) {
  const company = normalizeCompanyName(issue.companyName);

  return documents.find(
    (document) => normalizeCompanyName(getString(document.company)) === company,
  );
}

function findIpoHeadlines(
  issue: NormalizedIpoIssue,
  headlines: TrendHeadline[],
) {
  const companyName = normalizeCompanyName(issue.companyName);
  const companyTokens = companyName
    .split(" ")
    .filter((token) => token.length >= 4);

  return headlines.filter((headline) => {
    const text = normalizeText(`${headline.title} ${headline.summary ?? ""}`);

    if (hasWord(text, issue.symbol)) return true;
    if (companyName.length >= 6 && text.includes(companyName)) return true;

    const matchedTokens = companyTokens.filter((token) => hasWord(text, token));
    return matchedTokens.length >= Math.min(2, companyTokens.length);
  });
}

function normalizeIssue(
  issue: NseIpoIssue,
  category: IndiaIpoCandidate["category"],
): NormalizedIpoIssue | null {
  const companyName = getString(issue.companyName) || getString(issue.company);
  const symbol = getString(issue.symbol).toUpperCase();

  if (!companyName || !symbol) return null;

  const priceBand =
    getString(issue.priceBand) || getString(issue.issuePrice) || null;

  return {
    category,
    companyName,
    symbol,
    series: getString(issue.series) || "IPO",
    status: getString(issue.status) || category,
    issueStartDate: normalizeNseDate(issue.issueStartDate),
    issueEndDate: normalizeNseDate(issue.issueEndDate),
    priceBand,
    issueSizeShares: getPositiveNumber(issue.issueSize),
    lotSize: getPositiveNumber(issue.lotSize),
    upperPrice: getUpperPrice(priceBand),
  };
}

function emptyCompanyAnalysis(): CompanyAnalysis {
  return {
    coverage: "Unavailable",
    sections: [],
    documentStatus: "No matched official offer document",
    drhpUrl: null,
    rhpUrl: null,
    finalProspectusUrl: null,
    abridgedProspectusUrl: null,
    businessOverview: null,
    issueObjects: [],
    financials: {
      totalIncome: null,
      profitAfterTax: null,
      netWorth: null,
      returnOnNetWorth: null,
      basicEps: null,
      profitable: null,
    },
    litigationSummary: null,
    regulatorySummary: null,
    positives: [],
    concerns: [],
  };
}

function compareIpos(first: IndiaIpoCandidate, second: IndiaIpoCandidate) {
  if (first.category !== second.category) {
    return first.category === "Open now" ? -1 : 1;
  }

  return (
    new Date(first.issueStartDate ?? "9999-12-31").getTime() -
    new Date(second.issueStartDate ?? "9999-12-31").getTime()
  );
}

function headlinesText(sentiment: AgentPick["sentiment"], sourceCount: number) {
  return `${sentiment.fullTextArticles} full-text report${sentiment.fullTextArticles === 1 ? "" : "s"}, ${sentiment.summaryArticles} summary report${sentiment.summaryArticles === 1 ? "" : "s"}, and ${sourceCount} independent news source${sourceCount === 1 ? "" : "s"}`;
}

function sortHeadlinesNewestFirst(headlines: TrendHeadline[]) {
  return [...headlines].sort(
    (first, second) =>
      new Date(second.publishedAt ?? 0).getTime() -
      new Date(first.publishedAt ?? 0).getTime(),
  );
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`NSE request failed (${response.status})`);
  }

  return response.json() as Promise<unknown>;
}

function getLandingHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": nseUserAgent,
  };
}

function getNseApiHeaders(cookies: string) {
  return {
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: cookies,
    Referer: nseOfferDocumentsPage,
    "User-Agent": nseUserAgent,
  };
}

function getResponseRows(value: unknown, key: string) {
  if (!value || typeof value !== "object") return [];
  const rows = (value as Record<string, unknown>)[key];
  return parseObjectArray(rows);
}

function parseIssueArray(value: unknown): NseIpoIssue[] {
  if (Array.isArray(value)) return value as NseIpoIssue[];
  if (!value || typeof value !== "object") return [];

  const object = value as Record<string, unknown>;
  const candidates = [
    object.data,
    object.currentIssueDetails,
    object.issueDetails,
    object.forthcomingIssueDetails,
  ];

  return (candidates.find(Array.isArray) as NseIpoIssue[] | undefined) ?? [];
}

function parseObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function getProfitability(financial: Record<string, unknown> | undefined) {
  const profit = getNumericValue(financial?.profAfterItemsAndTax);
  return profit === null ? null : profit > 0;
}

function getNumericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const numeric = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function displayValue(value: unknown) {
  const text = getString(value);
  return text && !/^(?:-|n\.?a\.?|not applicable|null)$/i.test(text)
    ? text
    : null;
}

function getDocumentUrl(value: unknown) {
  const url = displayValue(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function isBenignDisclosure(value: string) {
  return !/\b(?:criminal|disciplinary|material civil|regulatory proceedings|tax proceedings)\b/i.test(
    value.replace(/\b(?:n\.?a\.?|nil|none|not applicable|no)\b/gi, ""),
  );
}

function hasAdverseRegulatoryText(value: string) {
  const remaining = value
    .replace(/\bthere has been no disciplinary action\b/gi, "")
    .replace(/\b(?:n\.?a\.?|nil|none|not applicable)\b/gi, "");

  return /\b(?:disciplinary action|criminal proceedings|penalty|fraud|default|debarred)\b/i.test(
    remaining,
  );
}

function getUpperPrice(priceBand: string | null) {
  if (!priceBand) return null;
  const values = priceBand.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return values.length > 0 ? Math.max(...values) : null;
}

function normalizeNseDate(value: unknown) {
  const text = getString(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return text;

  const month = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  }[match[2]];

  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : text;
}

function getResponseCookies(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.() ?? [];
  const values =
    setCookies.length > 0
      ? setCookies
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];

  return values
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPositiveNumber(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : Number.NaN;

  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeCompanyName(value: string) {
  return normalizeText(value)
    .replace(
      /\b(LIMITED|LTD|PRIVATE|PVT|INDIA|INDUSTRIES|COMPANY|CORPORATION)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text: string, word: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(word)}(\\s|$)`).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

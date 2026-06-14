import type { IndiaIpoCandidate, TrendHeadline } from "../types";

type Props = {
  autoRefresh: boolean;
  generatedAt?: string;
  ipos: IndiaIpoCandidate[];
  isLoading: boolean;
  message?: string;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  sources: string[];
};

export function IpoWorkspace({
  autoRefresh,
  generatedAt,
  ipos,
  isLoading,
  message,
  onAutoRefreshChange,
  onRefresh,
  sources,
}: Props) {
  const openIpos = ipos.filter((ipo) => ipo.category === "Open now");
  const upcomingIpos = ipos.filter((ipo) => ipo.category === "Upcoming");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Indian IPO research
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Open and upcoming issues
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Uses official NSE issue terms and offer-document disclosures,
            including audited financials, issue purpose, litigation and
            regulatory sections, plus recent full-article news where available.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="cursor-pointer rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            {isLoading ? "Checking IPOs..." : "Refresh IPOs"}
          </button>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
            <input
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
              type="checkbox"
            />
            Auto refresh 5m
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Open now" value={openIpos.length} />
        <SummaryMetric label="Upcoming" value={upcomingIpos.length} />
        <SummaryMetric
          label="Consider applying"
          value={ipos.filter((ipo) => ipo.verdict === "Consider applying").length}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium uppercase text-slate-500">
        <p>
          Sources:{" "}
          {sources.length > 0
            ? sources.join(", ")
            : "NSE India IPO, NSE offer documents"}
        </p>
        <p>
          Checked:{" "}
          {generatedAt ? new Date(generatedAt).toLocaleString() : "Not run"}
        </p>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {message}
        </p>
      ) : null}

      <IpoGroup
        emptyMessage="NSE currently reports no IPO open for subscription."
        ipos={openIpos}
        title="Open now"
      />
      <IpoGroup
        emptyMessage="NSE currently reports no forthcoming IPO."
        ipos={upcomingIpos}
        title="Upcoming"
      />

      <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        “Consider applying” means the published evidence passed the displayed
        checks. It is not a guaranteed return or personalized investment
        recommendation. The app does not use unofficial grey-market premiums.
      </p>
    </section>
  );
}

function IpoGroup({
  emptyMessage,
  ipos,
  title,
}: {
  emptyMessage: string;
  ipos: IndiaIpoCandidate[];
  title: string;
}) {
  return (
    <section className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm font-semibold text-slate-500">
          {ipos.length} issue{ipos.length === 1 ? "" : "s"}
        </span>
      </div>

      {ipos.length > 0 ? (
        <div className="mt-3 grid gap-4">
          {ipos.map((ipo) => (
            <IpoCard ipo={ipo} key={`${ipo.symbol}-${ipo.issueStartDate}`} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      )}
    </section>
  );
}

function IpoCard({ ipo }: { ipo: IndiaIpoCandidate }) {
  const analysis = ipo.companyAnalysis;
  const decisionClass = getDecisionClass(ipo.assessment.decision);
  const documents = [
    ["DRHP", analysis.drhpUrl],
    ["RHP", analysis.rhpUrl],
    ["Final prospectus", analysis.finalProspectusUrl],
    ["Abridged prospectus", analysis.abridgedProspectusUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xl font-semibold">{ipo.companyName}</h4>
            <Badge>{ipo.symbol}</Badge>
            <Badge>{ipo.verdict}</Badge>
            <Badge>{ipo.series}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{ipo.reason}</p>
        </div>
        <div className={`min-w-48 border p-3 text-center ${decisionClass}`}>
          <p className="text-xs font-semibold uppercase">Should I apply?</p>
          <p className="mt-1 text-xl font-semibold">{ipo.assessment.decision}</p>
          <p className="mt-1 text-xs">
            {ipo.assessment.passedRequiredChecks}/
            {ipo.assessment.totalRequiredChecks} required checks passed
          </p>
        </div>
      </div>

      <dl className="mt-4 grid border-y border-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        <DataPoint
          label="Issue window"
          value={formatIssueWindow(ipo.issueStartDate, ipo.issueEndDate)}
        />
        <DataPoint label="Price band" value={ipo.priceBand ?? "Not published"} />
        <DataPoint
          label="Lot / minimum"
          value={`${ipo.lotSize?.toLocaleString("en-IN") ?? "Unknown"} shares / ${
            ipo.minimumInvestment === null
              ? "Not available"
              : `INR ${formatMoney(ipo.minimumInvestment)}`
          }`}
        />
        <DataPoint
          label="Official analysis"
          value={`${analysis.coverage} (${analysis.sections.length} sections)`}
        />
      </dl>

      <DecisionPanel ipo={ipo} />

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section>
          <h5 className="text-sm font-semibold text-slate-950">
            Company and financial evidence
          </h5>
          <dl className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <PlainData
              label="Reported total income"
              value={analysis.financials.totalIncome}
            />
            <PlainData
              label="Reported profit after tax"
              value={analysis.financials.profitAfterTax}
            />
            <PlainData
              label="Reported net worth"
              value={analysis.financials.netWorth}
            />
            <PlainData
              label="Return on net worth"
              value={analysis.financials.returnOnNetWorth}
            />
            <PlainData label="Basic EPS" value={analysis.financials.basicEps} />
            <PlainData label="Document status" value={analysis.documentStatus} />
          </dl>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Financial values are shown exactly as filed; verify units and periods
            in the linked prospectus.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            <strong className="text-slate-950">Business:</strong>{" "}
            {analysis.businessOverview ?? "Not available in structured filing."}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <strong className="text-slate-950">Use of proceeds:</strong>{" "}
            {analysis.issueObjects.length > 0
              ? analysis.issueObjects.join("; ")
              : "Not available in structured filing."}
          </p>
        </section>

        <section>
          <h5 className="text-sm font-semibold text-slate-950">
            Decision evidence
          </h5>
          <EvidenceList
            empty="No positive official factor was confirmed."
            items={analysis.positives}
            label="Supporting factors"
          />
          <EvidenceList
            empty="No specific concern was extracted, but general IPO risk remains."
            items={ipo.riskFlags}
            label="Risks and reasons to ignore"
          />
        </section>
      </div>

      <details className="mt-4 border-t border-slate-200 pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-blue-700">
          Review disclosures and source documents
        </summary>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
          <p>
            <strong className="text-slate-950">Litigation:</strong>{" "}
            {analysis.litigationSummary ?? "No structured section available."}
          </p>
          <p>
            <strong className="text-slate-950">Regulatory:</strong>{" "}
            {analysis.regulatorySummary ?? "No structured section available."}
          </p>
          <p>
            <strong className="text-slate-950">News evidence:</strong>{" "}
            {ipo.sentiment.fullTextArticles} full text,{" "}
            {ipo.sentiment.summaryArticles} summaries, {ipo.sourceCount} sources;{" "}
            sentiment {ipo.sentiment.label.toLowerCase()}.
          </p>
          <p>
            <strong className="text-slate-950">Listing return:</strong>{" "}
            {ipo.listingGainEstimate}
          </p>
          {documents.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <a
                className="font-semibold text-blue-700 hover:underline"
                href={ipo.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                NSE offer documents
              </a>
              {documents.map(([label, url]) => (
                <a
                  className="font-semibold text-blue-700 hover:underline"
                  href={url}
                  key={label}
                  rel="noreferrer"
                  target="_blank"
                >
                  {label}
                </a>
              ))}
            </div>
          ) : null}
          {ipo.headlines.map((headline) => (
            <HeadlineLink
              headline={headline}
              key={`${ipo.symbol}-${headline.link}`}
            />
          ))}
        </div>
      </details>
    </article>
  );
}

function DecisionPanel({ ipo }: { ipo: IndiaIpoCandidate }) {
  const assessment = ipo.assessment;
  const decisionClass = getDecisionClass(assessment.decision);

  return (
    <section className="mt-4 border-t border-slate-200 pt-4">
      <div
        className={`flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between ${decisionClass}`}
      >
        <div>
          <p className="text-xs font-semibold uppercase">Application decision</p>
          <p className="mt-1 text-2xl font-semibold">{assessment.decision}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-sm font-semibold">
            {assessment.passedRequiredChecks} of{" "}
            {assessment.totalRequiredChecks} required checks passed
          </p>
          <p className="mt-1 text-xs">
            No weighted or manually assigned credibility score is used.
          </p>
        </div>
      </div>

      <h5 className="mt-4 text-sm font-semibold text-slate-950">
        Application considerations
      </h5>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
              <th className="py-2 pr-3 font-semibold">Metric</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Observed value</th>
              <th className="py-2 font-semibold">How it affects the decision</th>
            </tr>
          </thead>
          <tbody>
            {assessment.metrics.map((metric) => (
              <tr
                className="border-b border-slate-200 align-top"
                key={metric.label}
              >
                <td className="py-3 pr-3 font-semibold text-slate-950">
                  {metric.label}
                  {metric.required ? (
                    <span className="ml-1 text-xs font-medium text-slate-500">
                      Required
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-3">
                  <MetricStatus status={metric.status} />
                </td>
                <td className="max-w-xs py-3 pr-3 text-slate-700">
                  {metric.value}
                </td>
                <td className="max-w-lg py-3 leading-6 text-slate-600">
                  {metric.consideration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assessment.blockingReasons.length > 0 ? (
        <div className="mt-3 border-l-2 border-amber-500 pl-3">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Why the app is not saying Apply
          </p>
          <ul className="mt-2 grid gap-1 text-sm leading-6 text-slate-700">
            {assessment.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function getDecisionClass(
  decision: IndiaIpoCandidate["assessment"]["decision"],
) {
  return {
    Apply: "border-emerald-300 bg-emerald-50 text-emerald-950",
    Wait: "border-amber-300 bg-amber-50 text-amber-950",
    "Do not apply": "border-red-300 bg-red-50 text-red-950",
  }[decision];
}

function MetricStatus({
  status,
}: {
  status: IndiaIpoCandidate["assessment"]["metrics"][number]["status"];
}) {
  const statusClass = {
    Pass: "bg-emerald-100 text-emerald-800",
    Concern: "bg-red-100 text-red-800",
    Missing: "bg-slate-200 text-slate-700",
    Pending: "bg-amber-100 text-amber-800",
    Information: "bg-blue-100 text-blue-800",
  }[status];

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold ${statusClass}`}>
      {status}
    </span>
  );
}

function EvidenceList({
  empty,
  items,
  label,
}: {
  empty: string;
  items: string[];
  label: string;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
        {(items.length > 0 ? items : [empty]).map((item) => (
          <li className="border-l-2 border-slate-300 pl-3" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeadlineLink({ headline }: { headline: TrendHeadline }) {
  return (
    <a
      className="border-l-2 border-blue-200 pl-3 text-slate-700 hover:text-blue-700"
      href={headline.link}
      rel="noreferrer"
      target="_blank"
    >
      <span className="block text-xs font-semibold uppercase text-slate-500">
        {headline.source} | {formatHeadlineTimestamp(headline.publishedAt)}
      </span>
      <span className="block font-medium">{headline.title}</span>
      <span className="block text-xs font-semibold uppercase text-blue-700">
        Analyzed: {headline.analysisDepth ?? "Headline only"}
        {headline.analyzedWordCount
          ? ` | ${headline.analyzedWordCount} words`
          : ""}
      </span>
    </a>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-2 border-blue-600 pl-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 py-3 sm:px-3 sm:first:pl-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function PlainData({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">
        {value ?? "Unavailable"}
      </dd>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatIssueWindow(start: string | null, end: string | null) {
  const formatDate = (value: string | null) =>
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Not published";

  return `${formatDate(start)} to ${formatDate(end)}`;
}

function formatHeadlineTimestamp(publishedAt: string | null) {
  return publishedAt
    ? new Date(publishedAt).toLocaleString()
    : "Publication time unavailable";
}

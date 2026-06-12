import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchZerodhaHoldings,
  fetchZerodhaPositions,
  fetchZerodhaQuotes,
  getZerodhaAccessToken,
  kiteCookieName,
} from "../../lib/zerodha";
import {
  buildZerodhaSignals,
  type KiteQuote,
} from "../../lib/zerodhaSignalEngine";
import { normalizeNseSymbol } from "../../lib/nseSymbols";

export async function GET(request: NextRequest) {
  try {
    return await getSignalsResponse(request);
  } catch (error) {
    console.error("Signal request failed:", error);
    const diagnostic =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined;

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        provider: "zerodha",
        signalCount: 0,
        message:
          "Zerodha data is temporarily unavailable. Reconnect Zerodha if this continues.",
        diagnostic,
        signals: [],
      },
      { status: 503 },
    );
  }
}

async function getSignalsResponse(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const cookieStore = await cookies();
  const accessToken = getZerodhaAccessToken(
    cookieStore.get(kiteCookieName)?.value,
  );
  const requestedSymbols = request.nextUrl.searchParams
    .get("symbols")
    ?.split(",")
    .map(normalizeNseSymbol)
    .filter(Boolean);

  if (!accessToken || !process.env.KITE_API_KEY) {
    return NextResponse.json({
      generatedAt,
      provider: "zerodha",
      signalCount: 0,
      message: "Connect Zerodha to scan Indian stocks with live NSE quotes.",
      signals: [],
    });
  }

  const portfolioResult =
    requestedSymbols && requestedSymbols.length > 0
      ? null
      : await getPortfolioSymbols(accessToken);
  const symbols =
    requestedSymbols && requestedSymbols.length > 0
      ? requestedSymbols
      : portfolioResult?.symbols ?? [];

  if (symbols.length === 0) {
    const response = NextResponse.json({
      generatedAt,
      provider: "zerodha",
      signalCount: 0,
      message:
        portfolioResult?.message ??
        "No symbols to scan. Add NSE symbols or connect Zerodha holdings/positions.",
      reconnectRequired: portfolioResult?.reconnectRequired ?? false,
      signals: [],
    });

    if (portfolioResult?.reconnectRequired) {
      response.cookies.delete(kiteCookieName);
    }

    return response;
  }

  const uniqueSymbols = Array.from(new Set(symbols));
  const quoteResult = await fetchZerodhaQuotes(
    uniqueSymbols.map((symbol) => `NSE:${symbol}`),
    accessToken,
  );
  const quotes = getQuotePayload(quoteResult.data);
  const signals = buildZerodhaSignals(quotes);
  const missingSymbols = uniqueSymbols.filter(
    (symbol) => !hasUsableQuote(quotes[`NSE:${symbol}`]),
  );

  const response = NextResponse.json({
    generatedAt,
    provider: "zerodha",
    signalCount: signals.length,
    message: quoteResult.reconnectRequired
      ? quoteResult.message
      : getSignalMessage(
          signals.length,
          missingSymbols,
          quoteResult.message,
        ),
    reconnectRequired: quoteResult.reconnectRequired ?? false,
    signals,
  });

  if (quoteResult.reconnectRequired) {
    response.cookies.delete(kiteCookieName);
  }

  return response;
}

async function getPortfolioSymbols(accessToken: string) {
  const [holdingsResult, positionsResult] = await Promise.all([
    fetchZerodhaHoldings(accessToken),
    fetchZerodhaPositions(accessToken),
  ]);
  const holdingSymbols = Array.isArray(holdingsResult.data)
    ? holdingsResult.data
        .map((holding) => holding?.tradingsymbol)
        .filter((symbol): symbol is string => typeof symbol === "string")
    : [];
  const netPositions = isPositionsPayload(positionsResult.data)
    ? positionsResult.data.net
    : Array.isArray(positionsResult.data)
      ? positionsResult.data
      : [];
  const positionSymbols = netPositions
    .filter(
      (position) =>
        position &&
        typeof position.tradingsymbol === "string" &&
        position.quantity !== 0,
    )
    .map((position) => position.tradingsymbol);

  const reconnectRequired = Boolean(
    holdingsResult.reconnectRequired || positionsResult.reconnectRequired,
  );

  return {
    symbols: [...holdingSymbols, ...positionSymbols]
      .map(normalizeNseSymbol)
      .filter(Boolean),
    reconnectRequired,
    message: reconnectRequired
      ? "Zerodha session expired or was invalidated. Connect Zerodha again."
      : undefined,
  };
}

function getQuotePayload(data: unknown): Record<string, KiteQuote> {
  if (
    data &&
    typeof data === "object" &&
    "data" in data &&
    data.data &&
    typeof data.data === "object"
  ) {
    return data.data as Record<string, KiteQuote>;
  }

  return {};
}

function isPositionsPayload(
  data: unknown,
): data is { net: Array<{ tradingsymbol: string; quantity: number }> } {
  return Boolean(
    data &&
      typeof data === "object" &&
      "net" in data &&
      Array.isArray(data.net),
  );
}

function hasUsableQuote(quote: KiteQuote | undefined) {
  return typeof quote?.last_price === "number" && quote.last_price > 0;
}

function getSignalMessage(
  signalCount: number,
  missingSymbols: string[],
  providerMessage?: string,
) {
  if (missingSymbols.length > 0) {
    const missingText = missingSymbols.join(", ");

    return signalCount > 0
      ? `No live quote data returned for ${missingText}. Check the exact NSE trading symbol.`
      : `No live quote data returned for ${missingText}. Check the exact NSE trading symbol, for example use HDFCBANK instead of HDFC.`;
  }

  return signalCount > 0
    ? undefined
    : providerMessage || "Zerodha did not return usable quote data.";
}

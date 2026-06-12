import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getZerodhaAccessToken,
  kiteCookieName,
} from "../../../lib/zerodha";
import { runMarketTrendAgent } from "../../../lib/marketTrendAgent";
import { runUsTrendAgent } from "../../../lib/usTrendAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const market = request.nextUrl.searchParams.get("market")?.toUpperCase();

    if (market === "US") {
      return NextResponse.json(await runUsTrendAgent(), {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    const cookieStore = await cookies();
    const accessToken = getZerodhaAccessToken(
      cookieStore.get(kiteCookieName)?.value,
    );

    if (!accessToken || !process.env.KITE_API_KEY) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        picks: [],
        sources: [],
        message: "Connect Zerodha to rank trend-backed Indian stocks.",
      });
    }

    const result = await runMarketTrendAgent(accessToken);
    const response = NextResponse.json(result);

    if ("reconnectRequired" in result && result.reconnectRequired) {
      response.cookies.delete(kiteCookieName);
    }

    return response;
  } catch (error) {
    console.error("Trend agent request failed:", error);
    const diagnostic =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined;

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        picks: [],
        sources: [],
        message:
          "Trend sources are temporarily unavailable. The next automatic refresh will retry.",
        diagnostic,
      },
      { status: 503 },
    );
  }
}

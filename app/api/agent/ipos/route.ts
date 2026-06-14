import { NextResponse } from "next/server";
import { runIndiaIpoAgent } from "../../../lib/indiaIpoAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await runIndiaIpoAgent(), {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("IPO agent request failed:", error);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        ipos: [],
        sources: ["NSE India IPO"],
        message: "IPO sources are temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchZerodhaQuotes, kiteCookieName } from "../../../../lib/zerodha";

export async function GET(request: NextRequest) {
  const instruments = request.nextUrl.searchParams.getAll("i");

  if (instruments.length === 0) {
    return NextResponse.json(
      { message: "Pass one or more instruments as ?i=NSE:INFY&i=NSE:TCS" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const result = await fetchZerodhaQuotes(
    instruments,
    cookieStore.get(kiteCookieName)?.value,
  );

  return NextResponse.json({
    provider: "zerodha",
    generatedAt: new Date().toISOString(),
    ...result,
  });
}

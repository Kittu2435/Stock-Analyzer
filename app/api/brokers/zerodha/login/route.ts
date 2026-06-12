import { NextResponse } from "next/server";
import { getZerodhaLoginUrl } from "../../../../lib/zerodha";

export function GET() {
  const loginUrl = getZerodhaLoginUrl();

  if (!loginUrl) {
    return NextResponse.json(
      { message: "KITE_API_KEY is required for Zerodha login." },
      { status: 400 },
    );
  }

  return NextResponse.redirect(loginUrl);
}

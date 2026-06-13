import { NextResponse } from "next/server";
import { getZerodhaLoginUrl } from "../../../../lib/zerodha";

export async function GET() {
  const loginUrl = await getZerodhaLoginUrl();

  if (!loginUrl) {
    return NextResponse.json(
      { message: "KITE_API_KEY is required for Zerodha login." },
      { status: 400 },
    );
  }

  return NextResponse.redirect(loginUrl);
}

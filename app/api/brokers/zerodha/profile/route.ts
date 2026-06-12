import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchZerodhaProfile, kiteCookieName } from "../../../../lib/zerodha";

export async function GET() {
  const cookieStore = await cookies();
  const result = await fetchZerodhaProfile(
    cookieStore.get(kiteCookieName)?.value,
  );

  return NextResponse.json({
    provider: "zerodha",
    generatedAt: new Date().toISOString(),
    ...result,
  });
}

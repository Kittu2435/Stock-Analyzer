import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  fetchZerodhaProfile,
  getZerodhaAccessToken,
  getZerodhaStatus,
  kiteCookieName,
} from "../../../../lib/zerodha";

export async function GET() {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(kiteCookieName)?.value;
  const accessToken = getZerodhaAccessToken(cookieToken);
  const profileResult = accessToken
    ? await fetchZerodhaProfile(accessToken)
    : null;
  const connected = Boolean(profileResult?.data);
  const response = NextResponse.json({
    provider: "zerodha",
    generatedAt: new Date().toISOString(),
    connected,
    reconnectRequired: profileResult?.reconnectRequired ?? false,
    message:
      profileResult?.message ??
      "Connect Zerodha to enable live Indian market data.",
    ...getZerodhaStatus(),
  });

  if (profileResult?.reconnectRequired) {
    response.cookies.delete(kiteCookieName);
  }

  return response;
}

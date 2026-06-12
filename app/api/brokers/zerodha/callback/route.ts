import { NextRequest, NextResponse } from "next/server";
import { exchangeRequestToken, kiteCookieName } from "../../../../lib/zerodha";

export async function GET(request: NextRequest) {
  const requestToken = request.nextUrl.searchParams.get("request_token");
  const status = request.nextUrl.searchParams.get("status");
  const action = request.nextUrl.searchParams.get("action");
  const redirectUrl = new URL("/", request.url);

  if (!requestToken || status === "error" || action === "error") {
    redirectUrl.searchParams.set("zerodha", "failed");
    redirectUrl.searchParams.set("reason", "missing_request_token");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const session = await exchangeRequestToken(requestToken);
    redirectUrl.searchParams.set("zerodha", "connected");
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set(kiteCookieName, session.access_token ?? "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: secondsUntilNextKiteExpiry(),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Zerodha callback failed:", error);
    redirectUrl.searchParams.set("zerodha", "failed");
    redirectUrl.searchParams.set("reason", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl);
  }
}

function secondsUntilNextKiteExpiry() {
  const now = new Date();
  const indiaOffsetMilliseconds = 5.5 * 60 * 60 * 1000;
  const indiaNow = new Date(now.getTime() + indiaOffsetMilliseconds);
  const nextExpiry = new Date(indiaNow);

  nextExpiry.setUTCHours(6, 0, 0, 0);
  if (indiaNow >= nextExpiry) {
    nextExpiry.setUTCDate(nextExpiry.getUTCDate() + 1);
  }

  return Math.max(
    60,
    Math.floor((nextExpiry.getTime() - indiaNow.getTime()) / 1000),
  );
}

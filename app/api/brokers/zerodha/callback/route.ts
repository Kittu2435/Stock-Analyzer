import { NextRequest, NextResponse } from "next/server";
import { exchangeRequestToken, kiteCookieName } from "../../../../lib/zerodha";

export async function GET(request: NextRequest) {
  const requestToken = request.nextUrl.searchParams.get("request_token");
  const status = request.nextUrl.searchParams.get("status");
  const action = request.nextUrl.searchParams.get("action");
  const redirectUrl = new URL("/", getPublicAppOrigin(request));

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

function getPublicAppOrigin(request: NextRequest) {
  const configuredOrigin = parseOrigin(process.env.APP_URL);

  if (configuredOrigin) return configuredOrigin;

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    "https";

  if (forwardedHost) {
    return `${forwardedProtocol}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

function parseOrigin(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (!["https:", "http:"].includes(url.protocol)) return null;

    return url.origin;
  } catch {
    return null;
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

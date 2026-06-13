import { NextResponse } from "next/server";
import { getZerodhaLoginUrl } from "../../../../lib/zerodha";
import { getServerConfigDiagnostic } from "../../../../lib/serverConfig";

export async function GET() {
  const loginUrl = await getZerodhaLoginUrl();

  if (!loginUrl) {
    const diagnostic = await getServerConfigDiagnostic();

    return NextResponse.json(
      {
        message:
          "KITE_API_KEY is unavailable. Check the AWS secret and Amplify compute-role permission.",
        diagnostic,
      },
      { status: 503 },
    );
  }

  return NextResponse.redirect(loginUrl);
}

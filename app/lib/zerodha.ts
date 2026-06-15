import { createHash } from "node:crypto";
import { getServerConfig } from "./serverConfig";

const kiteBaseUrl = "https://api.kite.trade";
const kiteCookieName = "kite_access_token";

type KiteSessionResponse = {
  data?: {
    access_token?: string;
    user_name?: string;
    user_id?: string;
    email?: string;
  };
  error_type?: string;
  message?: string;
};

type KiteErrorResponse = {
  error_type?: string;
  message?: string;
};

export { kiteCookieName };

export async function getZerodhaStatus() {
  const { KITE_API_KEY: apiKey, KITE_API_SECRET: apiSecret } =
    await getServerConfig();
  const missing = [
    ["KITE_API_KEY", apiKey],
    ["KITE_API_SECRET", apiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    configured: missing.length === 0,
    missing,
    capabilities: [
      "India equity research",
      "India F&O research",
      "Holdings and positions",
      "Quotes and market snapshots",
    ],
  };
}

export async function getZerodhaLoginUrl() {
  const { KITE_API_KEY: apiKey } = await getServerConfig();

  if (!apiKey) {
    return null;
  }

  const url = new URL("https://kite.zerodha.com/connect/login");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("v", "3");

  return url.toString();
}

export async function exchangeRequestToken(requestToken: string) {
  const { KITE_API_KEY: apiKey, KITE_API_SECRET: apiSecret } =
    await getServerConfig();

  if (!apiKey || !apiSecret) {
    throw new Error("KITE_API_KEY and KITE_API_SECRET are required.");
  }

  const checksum = createHash("sha256")
    .update(`${apiKey}${requestToken}${apiSecret}`)
    .digest("hex");
  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: requestToken,
    checksum,
  });

  const response = await fetch(`${kiteBaseUrl}/session/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Kite-Version": "3",
    },
    body,
  });

  const data = (await response.json()) as KiteSessionResponse;

  if (!response.ok || !data.data?.access_token) {
    throw new Error(data.message ?? "Unable to exchange Zerodha request token.");
  }

  return data.data;
}

export function getZerodhaAccessToken(cookieToken?: string) {
  return cookieToken || process.env.KITE_ACCESS_TOKEN || "";
}

export async function fetchZerodhaProfile(accessToken?: string) {
  return fetchZerodhaEndpoint("/user/profile", accessToken);
}

export async function fetchZerodhaHoldings(accessToken?: string) {
  return fetchZerodhaEndpoint("/portfolio/holdings", accessToken);
}

export async function fetchZerodhaPositions(accessToken?: string) {
  return fetchZerodhaEndpoint("/portfolio/positions", accessToken);
}

export async function fetchZerodhaGtts(accessToken?: string) {
  return fetchZerodhaEndpoint("/gtt/triggers", accessToken);
}

export async function placeZerodhaGtt(
  input: {
    type: "single" | "two-leg";
    condition: {
      exchange: "NSE";
      tradingsymbol: string;
      trigger_values: number[];
      last_price: number;
    };
    orders: Array<{
      exchange: "NSE";
      tradingsymbol: string;
      transaction_type: "BUY" | "SELL";
      quantity: number;
      order_type: "LIMIT";
      product: "CNC";
      price: number;
    }>;
  },
  accessTokenOverride?: string,
) {
  const { KITE_API_KEY: apiKey } = await getServerConfig();
  const accessToken = getZerodhaAccessToken(accessTokenOverride);

  if (!apiKey || !accessToken) {
    return {
      configured: false,
      data: null,
      message: "Connect Zerodha before placing a GTT.",
      statusCode: 401,
    };
  }

  const body = new URLSearchParams({
    type: input.type,
    condition: JSON.stringify(input.condition),
    orders: JSON.stringify(input.orders),
  });

  try {
    const response = await fetch(`${kiteBaseUrl}/gtt/triggers`, {
      method: "POST",
      headers: {
        ...getKiteHeaders(apiKey, accessToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      return kiteFailure(response, "Zerodha rejected the GTT request.");
    }

    const payload = (await response.json()) as {
      data?: { trigger_id?: number };
    };

    return {
      configured: true,
      data: payload.data ?? null,
      message: "Zerodha accepted the GTT request.",
      reconnectRequired: false,
      statusCode: response.status,
    };
  } catch {
    return {
      configured: true,
      data: null,
      message:
        "Zerodha could not be reached. No confirmed GTT was created by this request.",
      reconnectRequired: false,
      statusCode: 503,
    };
  }
}

export async function fetchZerodhaQuotes(
  instruments: string[],
  accessTokenOverride?: string,
) {
  const { KITE_API_KEY: apiKey } = await getServerConfig();
  const accessToken = getZerodhaAccessToken(accessTokenOverride);

  if (!apiKey || !accessToken) {
    return {
      configured: false,
      data: null,
      message: "Connect Zerodha to enable live NSE quotes.",
    };
  }

  const url = new URL("https://api.kite.trade/quote");
  instruments.forEach((instrument) => url.searchParams.append("i", instrument));

  try {
    const response = await fetch(url, {
      headers: getKiteHeaders(apiKey, accessToken),
      cache: "no-store",
    });

    if (!response.ok) {
      return kiteFailure(response, "Zerodha quote request failed.");
    }

    return {
      configured: true,
      data: await response.json(),
      message: "Zerodha quote request completed.",
      reconnectRequired: false,
      statusCode: response.status,
    };
  } catch {
    return {
      configured: true,
      data: null,
      message: "Zerodha could not be reached. Check the connection and retry.",
      reconnectRequired: false,
      statusCode: 503,
    };
  }
}

export async function fetchZerodhaInstruments(
  accessTokenOverride?: string,
  exchange: "NFO" | "NSE" = "NSE",
) {
  const { KITE_API_KEY: apiKey } = await getServerConfig();
  const accessToken = getZerodhaAccessToken(accessTokenOverride);

  if (!apiKey || !accessToken) {
    return {
      configured: false,
      data: null,
      message: `Connect Zerodha to load live ${exchange} instruments.`,
    };
  }

  try {
    const response = await fetch(`${kiteBaseUrl}/instruments/${exchange}`, {
      headers: getKiteHeaders(apiKey, accessToken),
      cache: "no-store",
    });

    if (!response.ok) {
      return kiteFailure(
        response,
        `Zerodha ${exchange} instrument request failed.`,
      );
    }

    return {
      configured: true,
      data: await response.text(),
      message: `Zerodha ${exchange} instrument request completed.`,
      reconnectRequired: false,
      statusCode: response.status,
    };
  } catch {
    return {
      configured: true,
      data: null,
      message: `Zerodha ${exchange} instruments could not be reached.`,
      reconnectRequired: false,
      statusCode: 503,
    };
  }
}

export async function fetchZerodhaDailyCandles(
  instrumentToken: string,
  from: string,
  to: string,
  accessTokenOverride?: string,
) {
  const { KITE_API_KEY: apiKey } = await getServerConfig();
  const accessToken = getZerodhaAccessToken(accessTokenOverride);

  if (!apiKey || !accessToken) {
    return {
      configured: false,
      data: null,
      message: "Connect Zerodha to load historical candles.",
    };
  }

  const url = new URL(
    `${kiteBaseUrl}/instruments/historical/${instrumentToken}/day`,
  );
  url.searchParams.set("from", `${from} 00:00:00`);
  url.searchParams.set("to", `${to} 23:59:59`);

  try {
    const response = await fetch(url, {
      headers: getKiteHeaders(apiKey, accessToken),
      cache: "no-store",
    });

    if (!response.ok) {
      return kiteFailure(
        response,
        `Zerodha historical request failed (${response.status}).`,
      );
    }

    const payload = (await response.json()) as {
      data?: {
        candles?: Array<[string, number, number, number, number, number]>;
      };
    };

    return {
      configured: true,
      data: payload.data?.candles ?? [],
      message: "Zerodha historical request completed.",
      reconnectRequired: false,
      statusCode: response.status,
    };
  } catch {
    return {
      configured: true,
      data: null,
      message: "Zerodha historical data could not be reached.",
      reconnectRequired: false,
      statusCode: 503,
    };
  }
}

async function fetchZerodhaEndpoint(path: string, accessTokenOverride?: string) {
  const { KITE_API_KEY: apiKey } = await getServerConfig();
  const accessToken = getZerodhaAccessToken(accessTokenOverride);

  if (!apiKey || !accessToken) {
    return {
      configured: false,
      data: null,
      message: "Connect Zerodha to enable this data.",
    };
  }

  try {
    const response = await fetch(`${kiteBaseUrl}${path}`, {
      headers: getKiteHeaders(apiKey, accessToken),
      cache: "no-store",
    });

    if (!response.ok) {
      return kiteFailure(response, `Zerodha request failed for ${path}.`);
    }

    const payload = await response.json();

    return {
      configured: true,
      data: payload.data,
      message: `Zerodha request completed for ${path}.`,
      reconnectRequired: false,
      statusCode: response.status,
    };
  } catch {
    return {
      configured: true,
      data: null,
      message: "Zerodha could not be reached. Check the connection and retry.",
      reconnectRequired: false,
      statusCode: 503,
    };
  }
}

function getKiteHeaders(apiKey: string, accessToken: string) {
  return {
    Authorization: `token ${apiKey}:${accessToken}`,
    "X-Kite-Version": "3",
  };
}

async function kiteFailure(response: Response, fallbackMessage: string) {
  let error: KiteErrorResponse = {};

  try {
    error = (await response.json()) as KiteErrorResponse;
  } catch {
    error = {};
  }
  const reconnectRequired = error.error_type === "TokenException";
  const permissionDenied =
    response.status === 403 && !reconnectRequired;

  return {
    configured: true,
    data: null,
    message: reconnectRequired
      ? "Zerodha session expired or was invalidated. Connect Zerodha again."
      : permissionDenied
        ? error.message ||
          "Zerodha denied this market-data request. Check your Kite Connect subscription and API permissions."
      : error.message || fallbackMessage,
    reconnectRequired,
    errorType: error.error_type ?? null,
    statusCode: response.status,
  };
}

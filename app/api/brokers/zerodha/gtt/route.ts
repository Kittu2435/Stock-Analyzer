import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { normalizeNseSymbol } from "../../../../lib/nseSymbols";
import {
  fetchZerodhaGtts,
  fetchZerodhaHoldings,
  fetchZerodhaQuotes,
  getZerodhaAccessToken,
  kiteCookieName,
  placeZerodhaGtt,
} from "../../../../lib/zerodha";

type GttRequest = {
  action?: unknown;
  symbol?: unknown;
  quantity?: unknown;
  entryTrigger?: unknown;
  buyLimitPrice?: unknown;
  stopLossTrigger?: unknown;
  stopLossLimitPrice?: unknown;
  targetTrigger?: unknown;
  targetLimitPrice?: unknown;
  sourceStrategy?: unknown;
  sourceVerdict?: unknown;
  confirmation?: unknown;
  acceptedRisks?: unknown;
};

type QuotePayload = {
  last_price?: unknown;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { message: "Order request origin could not be verified." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as GttRequest;
    const validated = validateRequest(body);

    if (!validated.ok) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const accessToken = getZerodhaAccessToken(
      cookieStore.get(kiteCookieName)?.value,
    );

    if (!accessToken) {
      return NextResponse.json(
        { message: "Connect Zerodha before reviewing or placing a GTT." },
        { status: 401 },
      );
    }

    const quoteResult = await fetchZerodhaQuotes(
      [`NSE:${validated.input.symbol}`],
      accessToken,
    );
    const lastPrice = getLastPrice(
      quoteResult.data,
      `NSE:${validated.input.symbol}`,
    );

    if (lastPrice === null) {
      return NextResponse.json(
        {
          message:
            quoteResult.message ||
            "A current Zerodha quote is required before creating a GTT.",
        },
        { status: quoteResult.reconnectRequired ? 401 : 503 },
      );
    }

    if (validated.input.action === "preview") {
      return NextResponse.json(
        buildPreview(validated.input, lastPrice),
      );
    }

    if (
      validated.input.confirmation !==
        (validated.input.action === "place-buy"
          ? `BUY ${validated.input.quantity} ${validated.input.symbol} CNC`
          : `PROTECT ${validated.input.quantity} ${validated.input.symbol}`) ||
      validated.input.acceptedRisks !== true
    ) {
      return NextResponse.json(
        {
          message:
            "The confirmation phrase and risk acknowledgement are required.",
        },
        { status: 400 },
      );
    }

    if (validated.input.action === "place-buy") {
      return placeBuyGtt(validated.input, lastPrice, accessToken);
    }

    return placeProtectionGtt(validated.input, lastPrice, accessToken);
  } catch (error) {
    console.error("Zerodha GTT request failed:", error);
    return NextResponse.json(
      {
        message:
          "The GTT request could not be completed. No confirmed order was created.",
      },
      { status: 500 },
    );
  }
}

async function placeBuyGtt(
  input: ValidatedInput,
  lastPrice: number,
  accessToken: string,
) {
  if (
    input.sourceStrategy !== "Long Term" ||
    input.sourceVerdict !== "Consider"
  ) {
    return NextResponse.json(
      {
        message:
          "Live delivery GTT is allowed only for a Long Term idea with a Consider verdict. Intraday, Swing, Watch, Avoid and No Trade ideas cannot be silently converted into investments.",
      },
      { status: 400 },
    );
  }

  const activeGtts = await fetchZerodhaGtts(accessToken);
  if (!Array.isArray(activeGtts.data)) {
    return NextResponse.json(
      {
        message:
          activeGtts.message ||
          "Existing Zerodha GTTs could not be checked. No new GTT was submitted.",
      },
      { status: activeGtts.reconnectRequired ? 401 : 503 },
    );
  }

  if (hasActiveBuyGtt(activeGtts.data, input.symbol)) {
    return NextResponse.json(
      {
        message:
          "An active BUY GTT already exists for this symbol. Review it in Zerodha before creating another.",
      },
      { status: 409 },
    );
  }

  const result = await placeZerodhaGtt(
    {
      type: "single",
      condition: {
        exchange: "NSE",
        tradingsymbol: input.symbol,
        trigger_values: [input.entryTrigger],
        last_price: lastPrice,
      },
      orders: [
        {
          exchange: "NSE",
          tradingsymbol: input.symbol,
          transaction_type: "BUY",
          quantity: input.quantity,
          order_type: "LIMIT",
          product: "CNC",
          price: input.buyLimitPrice,
        },
      ],
    },
    accessToken,
  );

  return NextResponse.json(
    {
      provider: "zerodha",
      action: "place-buy",
      triggerId: getTriggerId(result.data),
      message: result.message,
      protectionActive: false,
      protectionMessage:
        "Stop-loss and target are not active yet. After the BUY executes and the shares appear in holdings, create the protection GTT.",
    },
    { status: result.data ? 200 : result.statusCode || 502 },
  );
}

async function placeProtectionGtt(
  input: ValidatedInput,
  lastPrice: number,
  accessToken: string,
) {
  const activeGtts = await fetchZerodhaGtts(accessToken);
  if (!Array.isArray(activeGtts.data)) {
    return NextResponse.json(
      {
        message:
          activeGtts.message ||
          "Existing Zerodha GTTs could not be checked. No protection GTT was submitted.",
      },
      { status: activeGtts.reconnectRequired ? 401 : 503 },
    );
  }
  if (hasActiveProtectionGtt(activeGtts.data, input.symbol)) {
    return NextResponse.json(
      {
        message:
          "An active SELL protection GTT already exists for this symbol. Review it in Zerodha before creating another.",
      },
      { status: 409 },
    );
  }

  const holdingsResult = await fetchZerodhaHoldings(accessToken);
  const holdingQuantity = getHoldingQuantity(
    holdingsResult.data,
    input.symbol,
  );

  if (holdingQuantity < input.quantity) {
    return NextResponse.json(
      {
        message: `Zerodha holdings show ${holdingQuantity} available shares. Protection cannot be created for ${input.quantity}.`,
      },
      { status: 400 },
    );
  }

  if (
    input.stopLossTrigger >= lastPrice ||
    input.targetTrigger <= lastPrice
  ) {
    return NextResponse.json(
      {
        message:
          "For an existing holding, stop-loss must be below the current price and target must be above it.",
      },
      { status: 400 },
    );
  }

  const result = await placeZerodhaGtt(
    {
      type: "two-leg",
      condition: {
        exchange: "NSE",
        tradingsymbol: input.symbol,
        trigger_values: [input.stopLossTrigger, input.targetTrigger],
        last_price: lastPrice,
      },
      orders: [
        {
          exchange: "NSE",
          tradingsymbol: input.symbol,
          transaction_type: "SELL",
          quantity: input.quantity,
          order_type: "LIMIT",
          product: "CNC",
          price: input.stopLossLimitPrice,
        },
        {
          exchange: "NSE",
          tradingsymbol: input.symbol,
          transaction_type: "SELL",
          quantity: input.quantity,
          order_type: "LIMIT",
          product: "CNC",
          price: input.targetLimitPrice,
        },
      ],
    },
    accessToken,
  );

  return NextResponse.json(
    {
      provider: "zerodha",
      action: "protect",
      triggerId: getTriggerId(result.data),
      message: result.message,
      protectionActive: Boolean(result.data),
    },
    { status: result.data ? 200 : result.statusCode || 502 },
  );
}

type ValidatedInput = {
  action: "preview" | "place-buy" | "protect";
  symbol: string;
  quantity: number;
  entryTrigger: number;
  buyLimitPrice: number;
  stopLossTrigger: number;
  stopLossLimitPrice: number;
  targetTrigger: number;
  targetLimitPrice: number;
  sourceStrategy: string;
  sourceVerdict: string;
  confirmation: string;
  acceptedRisks: boolean;
};

function validateRequest(
  body: GttRequest,
): { ok: true; input: ValidatedInput } | { ok: false; message: string } {
  const action =
    body.action === "preview" ||
    body.action === "place-buy" ||
    body.action === "protect"
      ? body.action
      : null;
  const symbol = normalizeNseSymbol(body.symbol);
  const quantity = getPositiveInteger(body.quantity);
  const entryTrigger = getPositivePrice(body.entryTrigger);
  const buyLimitPrice = getPositivePrice(body.buyLimitPrice);
  const stopLossTrigger = getPositivePrice(body.stopLossTrigger);
  const stopLossLimitPrice = getPositivePrice(body.stopLossLimitPrice);
  const targetTrigger = getPositivePrice(body.targetTrigger);
  const targetLimitPrice = getPositivePrice(body.targetLimitPrice);

  if (!action || !symbol || !quantity) {
    return {
      ok: false,
      message: "Action, NSE symbol and a whole-number quantity are required.",
    };
  }
  if (!/^[A-Z0-9&-]{1,30}$/.test(symbol)) {
    return {
      ok: false,
      message: "The NSE symbol contains unsupported characters.",
    };
  }
  if (
    entryTrigger === null ||
    buyLimitPrice === null ||
    stopLossTrigger === null ||
    stopLossLimitPrice === null ||
    targetTrigger === null ||
    targetLimitPrice === null
  ) {
    return {
      ok: false,
      message: "Entry, limit, stop-loss and target prices must be positive.",
    };
  }
  if (buyLimitPrice < entryTrigger) {
    return {
      ok: false,
      message: "BUY limit price must be equal to or above the trigger price.",
    };
  }
  if (
    stopLossTrigger >= entryTrigger ||
    stopLossLimitPrice > stopLossTrigger ||
    targetTrigger <= entryTrigger ||
    targetLimitPrice < targetTrigger
  ) {
    return {
      ok: false,
      message:
        "Required order: stop limit <= stop trigger < entry trigger < target trigger <= target limit.",
    };
  }

  return {
    ok: true,
    input: {
      action,
      symbol,
      quantity,
      entryTrigger,
      buyLimitPrice,
      stopLossTrigger,
      stopLossLimitPrice,
      targetTrigger,
      targetLimitPrice,
      sourceStrategy:
        typeof body.sourceStrategy === "string" ? body.sourceStrategy : "",
      sourceVerdict:
        typeof body.sourceVerdict === "string" ? body.sourceVerdict : "",
      confirmation:
        typeof body.confirmation === "string" ? body.confirmation.trim() : "",
      acceptedRisks: body.acceptedRisks === true,
    },
  };
}

function buildPreview(input: ValidatedInput, lastPrice: number) {
  const eligible =
    input.sourceStrategy === "Long Term" &&
    input.sourceVerdict === "Consider";
  const warnings = [
    "This is a CNC delivery GTT, not an intraday order.",
    "A GTT trigger does not guarantee exchange execution.",
    "The stop-loss and target cannot become active until the BUY order executes.",
  ];

  if (!eligible) {
    warnings.unshift(
      "This idea is not eligible for live delivery placement because it is not both Long Term and Consider.",
    );
  }

  return {
    provider: "zerodha",
    action: "preview",
    eligible,
    symbol: input.symbol,
    exchange: "NSE",
    product: "CNC",
    quantity: input.quantity,
    currentPrice: lastPrice,
    entryTrigger: input.entryTrigger,
    buyLimitPrice: input.buyLimitPrice,
    estimatedInvestment: roundPrice(input.buyLimitPrice * input.quantity),
    stopLossTrigger: input.stopLossTrigger,
    stopLossLimitPrice: input.stopLossLimitPrice,
    targetTrigger: input.targetTrigger,
    targetLimitPrice: input.targetLimitPrice,
    sourceStrategy: input.sourceStrategy,
    sourceVerdict: input.sourceVerdict,
    warnings,
  };
}

function getLastPrice(data: unknown, instrument: string) {
  if (!data || typeof data !== "object") return null;
  const outer = data as Record<string, unknown>;
  const quotes =
    outer.data && typeof outer.data === "object"
      ? (outer.data as Record<string, unknown>)
      : outer;
  const quote = quotes[instrument] as QuotePayload | undefined;
  const value = quote?.last_price;
  return typeof value === "number" && value > 0 ? value : null;
}

function getHoldingQuantity(data: unknown, symbol: string) {
  if (!Array.isArray(data)) return 0;

  return data.reduce((total, holding) => {
    if (!holding || typeof holding !== "object") return total;
    const row = holding as Record<string, unknown>;
    return row.tradingsymbol === symbol && typeof row.quantity === "number"
      ? total + Math.max(0, row.quantity)
      : total;
  }, 0);
}

function hasActiveBuyGtt(data: unknown, symbol: string) {
  if (!Array.isArray(data)) return false;

  return data.some((trigger) => {
    if (!trigger || typeof trigger !== "object") return false;
    const row = trigger as Record<string, unknown>;
    const condition =
      row.condition && typeof row.condition === "object"
        ? (row.condition as Record<string, unknown>)
        : {};
    const orders = Array.isArray(row.orders) ? row.orders : [];

    return (
      row.status === "active" &&
      condition.tradingsymbol === symbol &&
      orders.some(
        (order) =>
          Boolean(order) &&
          typeof order === "object" &&
          (order as Record<string, unknown>).transaction_type === "BUY",
      )
    );
  });
}

function hasActiveProtectionGtt(data: unknown, symbol: string) {
  if (!Array.isArray(data)) return false;

  return data.some((trigger) => {
    if (!trigger || typeof trigger !== "object") return false;
    const row = trigger as Record<string, unknown>;
    const condition =
      row.condition && typeof row.condition === "object"
        ? (row.condition as Record<string, unknown>)
        : {};
    const orders = Array.isArray(row.orders) ? row.orders : [];
    const sellOrders = orders.filter(
      (order) =>
        Boolean(order) &&
        typeof order === "object" &&
        (order as Record<string, unknown>).transaction_type === "SELL",
    );

    return (
      row.status === "active" &&
      condition.tradingsymbol === symbol &&
      sellOrders.length >= 2
    );
  });
}

function getTriggerId(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>).trigger_id;
  return typeof value === "number" ? value : null;
}

function getPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function getPositivePrice(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? roundPrice(number) : null;
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host");
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    request.nextUrl.protocol.replace(":", "");

  return Boolean(
    forwardedHost && origin === `${forwardedProtocol}://${forwardedHost}`,
  );
}

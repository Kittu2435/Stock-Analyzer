"use client";

import { useEffect, useMemo, useState } from "react";
import type { TradeSignal } from "../types";

type OrderPreview = {
  eligible: boolean;
  currentPrice: number;
  estimatedInvestment: number;
  warnings: string[];
};

type OrderResult = {
  triggerId?: number | null;
  message: string;
  protectionActive?: boolean;
  protectionMessage?: string;
};

type Props = {
  signal: TradeSignal;
  sourceStrategy: string;
  sourceVerdict: string;
};

export function TradeOrderModal({
  signal,
  sourceStrategy,
  sourceVerdict,
}: Props) {
  const defaults = useMemo(() => getDefaultPrices(signal), [signal]);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"place-buy" | "protect">("place-buy");
  const [quantity, setQuantity] = useState("1");
  const [entryTrigger, setEntryTrigger] = useState(`${defaults.entryTrigger}`);
  const [buyLimitPrice, setBuyLimitPrice] = useState(`${defaults.entryTrigger}`);
  const [stopLossTrigger, setStopLossTrigger] = useState(
    `${defaults.stopLoss}`,
  );
  const [stopLossLimitPrice, setStopLossLimitPrice] = useState(
    `${defaults.stopLoss}`,
  );
  const [targetTrigger, setTargetTrigger] = useState(`${defaults.target}`);
  const [targetLimitPrice, setTargetLimitPrice] = useState(
    `${defaults.target}`,
  );
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [acceptedRisks, setAcceptedRisks] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasPlan =
    defaults.entryTrigger > 0 &&
    defaults.stopLoss > 0 &&
    defaults.target > defaults.entryTrigger;

  useEffect(() => {
    setEntryTrigger(`${defaults.entryTrigger}`);
    setBuyLimitPrice(`${defaults.entryTrigger}`);
    setStopLossTrigger(`${defaults.stopLoss}`);
    setStopLossLimitPrice(`${defaults.stopLoss}`);
    setTargetTrigger(`${defaults.target}`);
    setTargetLimitPrice(`${defaults.target}`);
    setPreview(null);
  }, [defaults]);

  if (signal.exchange !== "NSE") return null;

  function close() {
    if (isSubmitting) return;
    setIsOpen(false);
    setError(null);
    setResult(null);
    setPreview(null);
    setAcceptedRisks(false);
    setConfirmation("");
  }

  async function submit(action: "preview" | "place-buy" | "protect") {
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/brokers/zerodha/gtt", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          symbol: signal.symbol,
          quantity,
          entryTrigger,
          buyLimitPrice,
          stopLossTrigger,
          stopLossLimitPrice,
          targetTrigger,
          targetLimitPrice,
          sourceStrategy,
          sourceVerdict,
          acceptedRisks,
          confirmation,
        }),
      });
      const data = (await response.json()) as OrderPreview &
        OrderResult & { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Zerodha GTT request failed.");
      }

      if (action === "preview") {
        setPreview(data);
      } else {
        setResult({
          triggerId: data.triggerId,
          message: data.message,
          protectionActive: data.protectionActive,
          protectionMessage: data.protectionMessage,
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Zerodha GTT request failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const confirmationQuantity = Number.isInteger(Number(quantity))
    ? `${Number(quantity)}`
    : quantity;
  const requiredPhrase =
    mode === "place-buy"
      ? `BUY ${confirmationQuantity} ${signal.symbol} CNC`
      : `PROTECT ${confirmationQuantity} ${signal.symbol}`;
  const canSubmit =
    preview &&
    acceptedRisks &&
    confirmation === requiredPhrase &&
    (mode === "protect" || preview.eligible);

  return (
    <>
      <button
        className="cursor-pointer rounded-lg border border-blue-700 bg-white px-4 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        disabled={!hasPlan}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Buy stock
      </button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
        >
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase text-blue-700">
                  Zerodha CNC delivery
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  {signal.symbol} GTT order
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Source strategy: {sourceStrategy}. Source verdict:{" "}
                  {sourceVerdict}. This screen never submits without the final
                  confirmation step.
                </p>
              </div>
              <button
                aria-label="Close order dialog"
                className="cursor-pointer px-2 py-1 text-xl text-slate-500"
                onClick={close}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex border-b border-slate-300">
              {([
                ["place-buy", "Buy GTT"],
                ["protect", "Protect holding"],
              ] as const).map(([value, label]) => (
                <button
                  className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                    mode === value
                      ? "border-blue-700 text-blue-700"
                      : "border-transparent text-slate-500"
                  }`}
                  key={value}
                  onClick={() => {
                    setMode(value);
                    setPreview(null);
                    setResult(null);
                    setError(null);
                    setAcceptedRisks(false);
                    setConfirmation("");
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <OrderInput
                label="Quantity"
                onChange={(value) => {
                  setQuantity(value);
                  setPreview(null);
                }}
                step="1"
                value={quantity}
              />
              <ReadOnlyValue
                label="Execution"
                value={
                  mode === "place-buy"
                    ? "Single BUY GTT, CNC delivery"
                    : "Two-leg SELL OCO GTT"
                }
              />
              <OrderInput
                label="Buy trigger"
                onChange={(value) => {
                  setEntryTrigger(value);
                  setPreview(null);
                }}
                value={entryTrigger}
              />
              <OrderInput
                label="Buy limit price"
                onChange={(value) => {
                  setBuyLimitPrice(value);
                  setPreview(null);
                }}
                value={buyLimitPrice}
              />
              <OrderInput
                label="Stop-loss trigger"
                onChange={(value) => {
                  setStopLossTrigger(value);
                  setPreview(null);
                }}
                value={stopLossTrigger}
              />
              <OrderInput
                label="Stop-loss limit"
                onChange={(value) => {
                  setStopLossLimitPrice(value);
                  setPreview(null);
                }}
                value={stopLossLimitPrice}
              />
              <OrderInput
                label="Target trigger"
                onChange={(value) => {
                  setTargetTrigger(value);
                  setPreview(null);
                }}
                value={targetTrigger}
              />
              <OrderInput
                label="Target limit"
                onChange={(value) => {
                  setTargetLimitPrice(value);
                  setPreview(null);
                }}
                value={targetLimitPrice}
              />
            </div>

            <p className="mt-4 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-slate-700">
              A BUY GTT cannot protect shares that have not been purchased yet.
              Stop-loss and target become active only after the BUY executes and
              you create the Protect holding OCO GTT.
            </p>

            <button
              className="mt-4 cursor-pointer rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
              onClick={() => submit("preview")}
              type="button"
            >
              {isSubmitting ? "Checking Zerodha..." : "Refresh order preview"}
            </button>

            {preview ? (
              <section className="mt-4 border-t border-slate-200 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadOnlyValue
                    label="Current Zerodha price"
                    value={formatMoney(preview.currentPrice)}
                  />
                  <ReadOnlyValue
                    label="Estimated investment"
                    value={`INR ${formatMoney(preview.estimatedInvestment)}`}
                  />
                </div>
                <ul className="mt-3 grid gap-1 text-sm leading-6 text-slate-700">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview ? (
              <section className="mt-4 border-t border-slate-200 pt-4">
                <label className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                  <input
                    checked={acceptedRisks}
                    className="mt-1"
                    onChange={(event) => setAcceptedRisks(event.target.checked)}
                    type="checkbox"
                  />
                  I reviewed the symbol, quantity, prices, product, strategy
                  mismatch warning, and understand that GTT placement does not
                  guarantee execution.
                </label>
                <label className="mt-3 block text-sm font-semibold text-slate-700">
                  Type <span className="text-slate-950">{requiredPhrase}</span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                    onChange={(event) => setConfirmation(event.target.value)}
                    value={confirmation}
                  />
                </label>
                <button
                  className="mt-4 cursor-pointer rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={!canSubmit || isSubmitting}
                  onClick={() => submit(mode)}
                  type="button"
                >
                  {mode === "place-buy"
                    ? "Place BUY GTT in Zerodha"
                    : "Create stop-loss and target GTT"}
                </button>
              </section>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                {error}
              </p>
            ) : null}

            {result ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                <p className="font-semibold">{result.message}</p>
                {result.triggerId ? <p>Trigger ID: {result.triggerId}</p> : null}
                {result.protectionMessage ? (
                  <p>{result.protectionMessage}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function getDefaultPrices(signal: TradeSignal) {
  const plan = signal.entryPlan;
  const pullbackEntry =
    plan.pullbackLow !== null && plan.pullbackHigh !== null
      ? (plan.pullbackLow + plan.pullbackHigh) / 2
      : null;
  const entryTrigger =
    plan.preferred === "Pullback"
      ? pullbackEntry
      : plan.breakoutTrigger ?? pullbackEntry;

  return {
    entryTrigger: roundPrice(entryTrigger ?? 0),
    stopLoss: roundPrice(plan.stopLoss ?? 0),
    target: roundPrice(plan.targets[0] ?? 0),
  };
}

function OrderInput({
  label,
  onChange,
  step = "0.05",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  step?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
        min="0"
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

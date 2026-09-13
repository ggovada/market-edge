"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, X } from "lucide-react";
import { formatINR } from "@/lib/utils";

/** Warn when entry price differs from live quote by more than this % */
const PRICE_DEVIATION_WARN_PCT = 5;

type Props = {
  open: boolean;
  onClose: () => void;
  portfolioId: string;
  onSaved: () => void;
  initial?: {
    id?: string;
    ticker?: string;
    action?: "BUY" | "SELL";
    instrumentType?: "EQUITY" | "FUTURES";
    quantity?: number;
    pricePerShare?: number;
    fees?: number;
    executedAt?: string;
    notes?: string;
  };
};

type Step = 1 | 2 | 3 | 4;

export function TradeForm({ open, onClose, portfolioId, onSaved, initial }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [action, setAction] = useState<"BUY" | "SELL">(initial?.action ?? "BUY");
  const [instrumentType, setInstrumentType] = useState<"EQUITY" | "FUTURES">(
    initial?.instrumentType ?? "EQUITY"
  );
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? ""));
  const [price, setPrice] = useState(String(initial?.pricePerShare ?? ""));
  const [fees, setFees] = useState(String(initial?.fees ?? "0"));
  const [executedAt, setExecutedAt] = useState(
    initial?.executedAt?.slice(0, 16) ?? new Date().toISOString().slice(0, 16)
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirmFarPrice, setConfirmFarPrice] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTicker(initial?.ticker ?? "");
    setAction(initial?.action ?? "BUY");
    setInstrumentType(initial?.instrumentType ?? "EQUITY");
    setQuantity(String(initial?.quantity ?? ""));
    setPrice(String(initial?.pricePerShare ?? ""));
    setFees(String(initial?.fees ?? "0"));
    setExecutedAt(
      initial?.executedAt?.slice(0, 16) ?? new Date().toISOString().slice(0, 16)
    );
    setNotes(initial?.notes ?? "");
    setError(null);
    setLivePrice(null);
    setConfirmFarPrice(false);
    setShowAdvanced(false);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !ticker.trim() || ticker.trim().length < 2) {
      setLivePrice(null);
      return;
    }
    const handle = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(ticker.trim().toUpperCase())}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const q = data.quotes?.[0];
        setLivePrice(q?.price != null && q.price > 0 ? q.price : null);
      } catch {
        setLivePrice(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [ticker, open]);

  const entryPrice = Number(price);
  const deviationPct =
    livePrice != null && livePrice > 0 && entryPrice > 0
      ? (Math.abs(entryPrice - livePrice) / livePrice) * 100
      : 0;
  const isFarFromMarket = deviationPct >= PRICE_DEVIATION_WARN_PCT;

  useEffect(() => {
    setConfirmFarPrice(false);
  }, [price, ticker, livePrice]);

  if (!open) return null;

  function canContinueStep1() {
    return ticker.trim().length >= 2;
  }
  function canContinueStep2() {
    return Number(quantity) > 0;
  }
  function canContinueStep3() {
    return Number(price) > 0;
  }

  async function save() {
    if (isFarFromMarket && !confirmFarPrice) {
      setError(
        `The price you typed is ${deviationPct.toFixed(0)}% different from today’s market price (${formatINR(livePrice!)}). Please check it, or tick the box below if it is correct.`
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: initial?.id,
        portfolioId,
        ticker,
        action,
        instrumentType,
        quantity: Number(quantity),
        pricePerShare: Number(price),
        fees: Number(fees || 0),
        executedAt: new Date(executedAt).toISOString(),
        notes: notes || undefined,
      };
      const res = await fetch("/api/trades", {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = "Could not save the trade";
        try {
          msg = JSON.parse(text).error || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const stepTitle =
    step === 1
      ? "What did you trade?"
      : step === 2
        ? "How many?"
        : step === 3
          ? "At what price?"
          : "Check and save";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div
        className="card flex h-full w-full max-w-xl flex-col overflow-hidden rounded-none md:h-auto md:max-h-[92vh] md:rounded-2xl"
        role="dialog"
        aria-modal
        aria-labelledby="trade-form-title"
      >
        <div className="flex items-center justify-between border-b-2 border-line px-4 py-4">
          <div>
            <p className="text-base text-muted">
              Step {step} of 4
            </p>
            <h2
              id="trade-form-title"
              className="font-[family-name:var(--font-display)] text-2xl font-semibold"
            >
              {initial?.id ? "Edit trade" : stepTitle}
            </h2>
          </div>
          <button className="btn btn-ghost !px-3" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="step-dots" aria-hidden>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`step-dot ${step === s ? "active" : ""}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-5">
          {step === 1 ? (
            <>
              <div>
                <label className="label">Bought or sold?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`btn ${action === "BUY" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setAction("BUY")}
                  >
                    Bought
                  </button>
                  <button
                    type="button"
                    className={`btn ${action === "SELL" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setAction("SELL")}
                  >
                    Sold
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Stock or futures?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`btn ${instrumentType === "EQUITY" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setInstrumentType("EQUITY")}
                  >
                    Stock
                  </button>
                  <button
                    type="button"
                    className={`btn ${instrumentType === "FUTURES" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setInstrumentType("FUTURES")}
                  >
                    Futures
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="trade-ticker">
                  Stock symbol
                </label>
                <input
                  id="trade-ticker"
                  className="input"
                  required
                  autoFocus
                  placeholder={
                    instrumentType === "FUTURES"
                      ? "Example: NIFTY25APRFUT.NS"
                      : "Example: RELIANCE.NS"
                  }
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                />
                <p className="help">
                  Use the Yahoo Finance symbol. Indian stocks usually end with{" "}
                  <strong>.NS</strong> (example: TCS.NS).
                </p>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <div>
              <label className="label" htmlFor="trade-qty">
                {instrumentType === "FUTURES" ? "Number of lots" : "Number of shares"}
              </label>
              <input
                id="trade-qty"
                className="input"
                required
                autoFocus
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="help">
                You {action === "BUY" ? "bought" : "sold"}{" "}
                <strong>{ticker || "this symbol"}</strong>.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <>
              <div>
                <label className="label" htmlFor="trade-price">
                  Price per {instrumentType === "FUTURES" ? "unit" : "share"}
                </label>
                <input
                  id="trade-price"
                  className={`input ${isFarFromMarket ? "!border-warn" : ""}`}
                  required
                  autoFocus
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <p className="help">
                  {quoteLoading
                    ? "Checking today’s market price…"
                    : livePrice != null
                      ? `Today’s market price: ${formatINR(livePrice)}`
                      : "No live price found yet — double-check the symbol."}
                </p>
                {livePrice != null ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-lg mt-3 w-full"
                    onClick={() => setPrice(String(livePrice))}
                  >
                    Use today’s price ({formatINR(livePrice)})
                  </button>
                ) : null}
              </div>

              {isFarFromMarket ? (
                <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-base text-warn">
                  <div className="flex gap-3">
                    <AlertTriangle size={22} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-ink">
                        This price looks different from the market
                      </p>
                      <p className="mt-1 text-ink">
                        You typed {formatINR(entryPrice)}. Today’s quote is{" "}
                        {formatINR(livePrice!)} ({deviationPct.toFixed(0)}% apart).
                        This often means a typing mistake.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="card space-y-3 border-2 border-line p-4 shadow-none">
                <Row label="Action" value={action === "BUY" ? "Bought" : "Sold"} />
                <Row
                  label="Type"
                  value={instrumentType === "FUTURES" ? "Futures" : "Stock"}
                />
                <Row label="Symbol" value={ticker} />
                <Row label="Quantity" value={quantity} />
                <Row label="Price" value={formatINR(Number(price) || 0)} />
                <Row
                  label="Total"
                  value={formatINR((Number(quantity) || 0) * (Number(price) || 0))}
                />
              </div>

              {isFarFromMarket ? (
                <label className="flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-base">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={confirmFarPrice}
                    onChange={(e) => setConfirmFarPrice(e.target.checked)}
                  />
                  <span>
                    I checked the price and it is correct (for example, an older trade
                    from a different date).
                  </span>
                </label>
              ) : null}

              <button
                type="button"
                className="text-base font-semibold text-accent underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide extra details" : "Add fees, date, or notes"}
              </button>

              {showAdvanced ? (
                <div className="space-y-4">
                  <div>
                    <label className="label" htmlFor="trade-fees">
                      Fees / brokerage
                    </label>
                    <input
                      id="trade-fees"
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      value={fees}
                      onChange={(e) => setFees(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="trade-when">
                      When was this trade?
                    </label>
                    <input
                      id="trade-when"
                      className="input"
                      type="datetime-local"
                      value={executedAt}
                      onChange={(e) => setExecutedAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="trade-notes">
                      Notes (optional)
                    </label>
                    <textarea
                      id="trade-notes"
                      className="textarea"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? <p className="text-base font-medium text-loss">{error}</p> : null}
        </div>

        <div className="flex gap-3 border-t-2 border-line p-4">
          {step > 1 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              <ArrowLeft size={18} />
              Back
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={
                (step === 1 && !canContinueStep1()) ||
                (step === 2 && !canContinueStep2()) ||
                (step === 3 && !canContinueStep3())
              }
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={saving || (isFarFromMarket && !confirmFarPrice)}
              onClick={save}
            >
              {saving ? "Saving…" : "Save trade"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-base">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

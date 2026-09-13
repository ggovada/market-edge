"use client";

import { useEffect, useRef, useState } from "react";
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
    lotSize?: number;
    margin?: number;
    pricePerShare?: number;
    fees?: number;
    executedAt?: string;
    notes?: string;
  };
};

type Step = 1 | 2 | 3 | 4;

type SearchHit = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  lotSize?: number;
  expiry?: string;
};

export function TradeForm({ open, onClose, portfolioId, onSaved, initial }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [companyQuery, setCompanyQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<"BUY" | "SELL">(initial?.action ?? "BUY");
  const [instrumentType, setInstrumentType] = useState<"EQUITY" | "FUTURES">(
    initial?.instrumentType ?? "EQUITY"
  );
  const [lotSize, setLotSize] = useState(String(initial?.lotSize ?? "1"));
  const [margin, setMargin] = useState(String(initial?.margin ?? ""));
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
    setCompanyQuery(initial?.ticker ?? "");
    setSuggestions([]);
    setShowSuggestions(false);
    setAction(initial?.action ?? "BUY");
    setInstrumentType(initial?.instrumentType ?? "EQUITY");
    setLotSize(String(initial?.lotSize ?? "1"));
    setMargin(String(initial?.margin ?? ""));
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
    function onDocClick(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open || step !== 1) return;
    const q = companyQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&type=${instrumentType}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [companyQuery, instrumentType, open, step]);

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
        lotSize:
          instrumentType === "FUTURES" ? Math.max(1, Number(lotSize) || 1) : 1,
        margin:
          instrumentType === "FUTURES" && action === "BUY"
            ? Math.max(0, Number(margin) || 0)
            : 0,
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
                    onClick={() => {
                      setInstrumentType("EQUITY");
                      setLotSize("1");
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                  >
                    Stock
                  </button>
                  <button
                    type="button"
                    className={`btn ${instrumentType === "FUTURES" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => {
                      setInstrumentType("FUTURES");
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                  >
                    Futures
                  </button>
                </div>
              </div>
              <div ref={searchWrapRef} className="relative">
                <label className="label" htmlFor="trade-company">
                  {instrumentType === "FUTURES"
                    ? "Company or contract name"
                    : "Company name"}
                </label>
                <input
                  id="trade-company"
                  className="input"
                  autoFocus
                  autoComplete="off"
                  placeholder={
                    instrumentType === "FUTURES"
                      ? "Try: Reliance, Nifty, Bank Nifty"
                      : "Try: Reliance, Infosys, HDFC Bank"
                  }
                  value={companyQuery}
                  onChange={(e) => {
                    setCompanyQuery(e.target.value);
                    setShowSuggestions(true);
                    // Allow typing a known ticker directly
                    const raw = e.target.value.trim();
                    if (/^[A-Za-z0-9.:^*=-]+$/.test(raw) && raw.length >= 2) {
                      setTicker(raw.toUpperCase());
                    } else if (!raw) {
                      setTicker("");
                    }
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                />
                {searchLoading ? (
                  <p className="help">Searching…</p>
                ) : showSuggestions && suggestions.length > 0 ? (
                  <ul
                    className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border-2 border-line bg-white shadow-lg"
                    role="listbox"
                  >
                    {suggestions.map((hit) => (
                      <li key={hit.symbol}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-[var(--accent-soft)]"
                          onClick={() => {
                            setTicker(hit.symbol);
                            setCompanyQuery(hit.name);
                            if (hit.lotSize) setLotSize(String(hit.lotSize));
                            setShowSuggestions(false);
                          }}
                        >
                          <span className="font-semibold text-ink">{hit.symbol}</span>
                          <span className="text-sm text-muted">
                            {hit.name}
                            {hit.lotSize ? ` · lot ${hit.lotSize}` : ""}
                            {hit.exchange ? ` · ${hit.exchange}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : showSuggestions &&
                  companyQuery.trim().length >= 2 &&
                  !searchLoading ? (
                  <p className="help">
                    No matches. Try another name, or type the ticker directly
                    (example:{" "}
                    {instrumentType === "FUTURES"
                      ? "NSE:RELIANCE26SEPFUT"
                      : "RELIANCE.NS"}
                    ).
                  </p>
                ) : null}
                {ticker ? (
                  <p className="help mt-2">
                    Selected ticker: <strong>{ticker}</strong>
                    {instrumentType === "FUTURES" && Number(lotSize) > 1
                      ? ` · lot size ${lotSize}`
                      : ""}
                  </p>
                ) : (
                  <p className="help">
                    {instrumentType === "FUTURES"
                      ? "Type a name and pick an NSE futures contract (lot size is filled in for you)."
                      : "Type the company name and pick the NSE ticker (usually ends with .NS)."}
                  </p>
                )}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
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
              {instrumentType === "FUTURES" ? (
                <div>
                  <label className="label" htmlFor="trade-lot-size">
                    Shares per lot
                  </label>
                  <input
                    id="trade-lot-size"
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={lotSize}
                    onChange={(e) => setLotSize(e.target.value)}
                  />
                  <p className="help">
                    From the contract master when you picked a ticker. You can
                    correct it if needed.
                    {Number(quantity) > 0 && Number(lotSize) > 0
                      ? ` Total underlying units: ${Number(quantity) * Number(lotSize)}.`
                      : ""}
                  </p>
                </div>
              ) : null}
              {instrumentType === "FUTURES" && action === "BUY" ? (
                <div>
                  <label className="label" htmlFor="trade-margin">
                    Margin blocked (₹)
                  </label>
                  <input
                    id="trade-margin"
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={margin}
                    onChange={(e) => setMargin(e.target.value)}
                    placeholder="Optional — from your broker"
                  />
                  <p className="help">
                    Cash locked for this position. It leaves free cash now and
                    returns when you close (plus or minus P/L).
                  </p>
                </div>
              ) : null}
              {instrumentType === "FUTURES" && action === "SELL" ? (
                <p className="help">
                  Closing releases any margin that was blocked on the matching
                  open lots, and settles P/L into cash.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <>
              <div>
                <label className="label" htmlFor="trade-price">
                  {instrumentType === "FUTURES"
                    ? "Futures price (per unit)"
                    : "Price per share"}
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
                      : instrumentType === "FUTURES"
                        ? "Enter the price from your broker if no live quote appears."
                        : "No live price found yet — double-check the symbol."}
                </p>
                {instrumentType === "FUTURES" &&
                Number(quantity) > 0 &&
                Number(lotSize) > 0 &&
                Number(price) > 0 ? (
                  <p className="help mt-1">
                    Notional ≈{" "}
                    {formatINR(
                      Number(quantity) * Number(lotSize) * Number(price)
                    )}{" "}
                    (lots × lot size × price).
                  </p>
                ) : null}
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
                <Row
                  label={instrumentType === "FUTURES" ? "Lots" : "Quantity"}
                  value={quantity}
                />
                {instrumentType === "FUTURES" ? (
                  <Row label="Lot size" value={lotSize} />
                ) : null}
                {instrumentType === "FUTURES" && action === "BUY" && Number(margin) > 0 ? (
                  <Row label="Margin" value={formatINR(Number(margin) || 0)} />
                ) : null}
                <Row label="Price" value={formatINR(Number(price) || 0)} />
                <Row
                  label="Notional"
                  value={formatINR(
                    (Number(quantity) || 0) *
                      (instrumentType === "FUTURES"
                        ? Math.max(1, Number(lotSize) || 1)
                        : 1) *
                      (Number(price) || 0)
                  )}
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

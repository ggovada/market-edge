"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Plus, Trash2, Upload, Pencil } from "lucide-react";
import { Money, Pct } from "@/components/StatCard";
import { PortfolioValueChart } from "@/components/PortfolioValueChart";
import { TradeForm } from "@/components/TradeForm";
import { formatINR, formatNumber } from "@/lib/utils";

type PortfolioPayload = {
  portfolio: {
    id: string;
    name: string;
    type: string;
    member: { id: string; name: string };
  };
  metrics: {
    totalInvested: number;
    holdingsValue?: number;
    cashBalance?: number;
    marginBlocked?: number;
    netDeposits?: number;
    currentValue: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
    realizedPl: number;
    totalPl: number;
    dayChange: number;
    dayChangePct: number;
  };
  cash?: {
    cashBalance: number;
    netDeposits: number;
    deposits: number;
    withdrawals: number;
    transactions: {
      id: string;
      type: string;
      amount: number;
      executedAt: string;
      notes?: string | null;
    }[];
  };
  holdings: {
    ticker: string;
    instrumentType?: "EQUITY" | "FUTURES";
    quantity: number;
    lotSize?: number;
    avgCost: number;
    costBasis: number;
    price: number;
    marketValue: number;
    notional?: number;
    unrealized: number;
    unrealizedPct: number;
    dayChangePct: number;
    weightPct: number;
    lots: {
      id: string;
      quantity: number;
      costBasisPerShare: number;
      acquiredAt: string;
      daysHeld: number;
      daysToLongTerm: number;
      term: string;
    }[];
  }[];
  realized: {
    financialYear: string;
    stcg: { gainLoss: number };
    ltcg: { gainLoss: number };
    total: number;
    fromTrades?: number;
    adjustments?: {
      count: number;
      gainLoss: number;
      other: number;
      stcg: number;
      ltcg: number;
    };
  };
  realizedAllTime: {
    stcg: { gainLoss: number };
    ltcg: { gainLoss: number };
    total: number;
    fromTrades?: number;
    adjustments?: {
      count: number;
      gainLoss: number;
      other: number;
      stcg: number;
      ltcg: number;
    };
  };
  realizedAdjustments?: {
    id: string;
    amount: number;
    bookedAt: string;
    label?: string | null;
    term: string;
    notes?: string | null;
  }[];
  snapshots: { date: string; totalValue: number; totalCostBasis: number }[];
  trades: {
    id: string;
    ticker: string;
    action: "BUY" | "SELL";
    instrumentType?: "EQUITY" | "FUTURES";
    quantity: number;
    lotSize?: number;
    margin?: number;
    pricePerShare: number;
    fees: number;
    executedAt: string;
    notes?: string | null;
  }[];
  gains: {
    id: string;
    ticker: string;
    quantity: number;
    gainLoss: number;
    term: string;
    closedAt: string;
  }[];
};

export default function PortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<PortfolioPayload | null>(null);
  const [tab, setTab] = useState<
    "holdings" | "trades" | "lots" | "gains" | "cash" | "booked"
  >("holdings");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<PortfolioPayload["trades"][0] | null>(null);
  const [lotTicker, setLotTicker] = useState<string | null>(null);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [cashDate, setCashDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [cashType, setCashType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [editCashId, setEditCashId] = useState<string | null>(null);
  const [cashSaving, setCashSaving] = useState(false);

  const [bookedAmount, setBookedAmount] = useState("");
  const [bookedDate, setBookedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [bookedLabel, setBookedLabel] = useState("");
  const [bookedTerm, setBookedTerm] = useState<"OTHER" | "STCG" | "LTCG">("OTHER");
  const [bookedNotes, setBookedNotes] = useState("");
  const [editBookedId, setEditBookedId] = useState<string | null>(null);
  const [bookedSaving, setBookedSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portfolios/${id}`);
    const text = await res.text();
    if (!res.ok || !text) {
      console.error("Failed to load portfolio", res.status, text);
      return;
    }
    try {
      setData(JSON.parse(text));
    } catch (e) {
      console.error("Invalid portfolio JSON", e, text.slice(0, 200));
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(async () => {
      await fetch("/api/quotes?force=1");
      load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const sortedHoldings = useMemo(() => {
    if (!data) return [];
    return [...data.holdings].sort((a, b) => b.unrealized - a.unrealized);
  }, [data]);

  async function deleteTrade(tradeId: string) {
    if (!confirm("Remove this trade? You can still see it in the audit history later.")) return;
    await fetch(`/api/trades?id=${tradeId}`, { method: "DELETE" });
    load();
  }

  async function deletePortfolio() {
    if (
      !confirm(
        `Delete account “${data?.portfolio.name}”? This permanently removes its trades and holdings.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Could not delete this account. Please try again.");
      return;
    }
    router.push(`/members/${data?.portfolio.member.id}`);
  }

  async function onCsv(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = (result.data as Record<string, string>[]).map((r) => ({
          ticker: r.ticker || r.Ticker || r.symbol || r.Symbol,
          action: (r.action || r.Action || "").toUpperCase(),
          instrumentType: (
            r.instrumentType ||
            r.InstrumentType ||
            r.instrument ||
            "EQUITY"
          ).toUpperCase(),
          quantity: Number(r.quantity || r.Quantity || r.qty || r.Qty),
          pricePerShare: Number(r.price || r.Price || r.pricePerShare || r.PricePerShare),
          fees: Number(r.fees || r.Fees || 0),
          executedAt: r.executedAt || r.date || r.Date || r.ExecutedAt,
          notes: r.notes || r.Notes,
        }));
        await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolioId: id, bulk: true, rows }),
        });
        load();
      },
    });
  }

  function resetCashForm() {
    setEditCashId(null);
    setCashAmount("");
    setCashNotes("");
    setCashDate(new Date().toISOString().slice(0, 10));
    setCashType("DEPOSIT");
  }

  function startEditCash(t: NonNullable<PortfolioPayload["cash"]>["transactions"][0]) {
    setEditCashId(t.id);
    setCashAmount(String(t.amount));
    setCashNotes(t.notes ?? "");
    setCashDate(new Date(t.executedAt).toISOString().slice(0, 10));
    setCashType(t.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT");
    setTab("cash");
    setShowTaxDetails(false);
  }

  async function submitCash(typeOverride?: "DEPOSIT" | "WITHDRAWAL") {
    const amount = Number(cashAmount);
    if (!(amount > 0)) {
      alert("Enter an amount greater than zero.");
      return;
    }
    if (!cashDate) {
      alert("Choose a date.");
      return;
    }
    const type = typeOverride ?? cashType;
    setCashSaving(true);
    try {
      const executedAt = new Date(`${cashDate}T12:00:00`).toISOString();
      const res = await fetch(`/api/portfolios/${id}/cash`, {
        method: editCashId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editCashId ?? undefined,
          type,
          amount,
          notes: cashNotes || undefined,
          executedAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Could not save cash movement");
        return;
      }
      resetCashForm();
      await load();
    } finally {
      setCashSaving(false);
    }
  }

  async function removeCashTxn(txnId: string) {
    if (!confirm("Remove this cash entry?")) return;
    await fetch(`/api/portfolios/${id}/cash?txnId=${txnId}`, { method: "DELETE" });
    if (editCashId === txnId) resetCashForm();
    load();
  }

  function resetBookedForm() {
    setEditBookedId(null);
    setBookedAmount("");
    setBookedDate(new Date().toISOString().slice(0, 10));
    setBookedLabel("");
    setBookedTerm("OTHER");
    setBookedNotes("");
  }

  function startEditBooked(a: NonNullable<PortfolioPayload["realizedAdjustments"]>[0]) {
    setEditBookedId(a.id);
    setBookedAmount(String(a.amount));
    setBookedDate(a.bookedAt.slice(0, 10));
    setBookedLabel(a.label ?? "");
    setBookedTerm(
      a.term === "STCG" || a.term === "LTCG" ? a.term : "OTHER"
    );
    setBookedNotes(a.notes ?? "");
    setTab("booked");
    setShowTaxDetails(false);
  }

  async function submitBooked() {
    const amount = Number(bookedAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      alert("Enter a non-zero amount (negative for a loss).");
      return;
    }
    setBookedSaving(true);
    try {
      const body = {
        amount,
        bookedAt: bookedDate,
        label: bookedLabel || undefined,
        term: bookedTerm,
        notes: bookedNotes || undefined,
      };
      const res = await fetch(`/api/portfolios/${id}/realized-adjustments`, {
        method: editBookedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editBookedId ? { id: editBookedId, ...body } : body
        ),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Could not save booked P&L");
        return;
      }
      resetBookedForm();
      await load();
    } finally {
      setBookedSaving(false);
    }
  }

  async function removeBooked(adjId: string) {
    if (!confirm("Remove this booked P&L entry?")) return;
    await fetch(`/api/portfolios/${id}/realized-adjustments?id=${adjId}`, {
      method: "DELETE",
    });
    if (editBookedId === adjId) resetBookedForm();
    load();
  }

  if (!data) return <div className="text-lg text-muted">Loading account…</div>;

  const { portfolio, metrics } = data;
  const holdingsValue = metrics.holdingsValue ?? metrics.currentValue;
  const cashBalance = metrics.cashBalance ?? 0;
  const marginBlocked = metrics.marginBlocked ?? 0;
  const netDeposits = metrics.netDeposits ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/members/${portfolio.member.id}`}
          className="text-base font-medium text-accent underline"
        >
          ← Back to {portfolio.member.name}
        </Link>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold md:text-4xl">
              {portfolio.name}
            </h1>
            <p className="mt-1 text-lg text-muted">
              {portfolio.member.name}&apos;s account
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-ghost" onClick={deletePortfolio}>
              <Trash2 size={18} />
              Delete account
            </button>
            <label className="btn btn-ghost cursor-pointer">
              <Upload size={18} />
              Import from file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsv(f);
                }}
              />
            </label>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setEditTrade(null);
                setTradeOpen(true);
              }}
            >
              <Plus size={20} /> Add a trade
            </button>
          </div>
        </div>
      </div>

      <div className="card p-6 md:p-8">
        <p className="text-lg font-semibold text-muted">Account value today</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold md:text-5xl">
          {formatINR(metrics.currentValue)}
        </p>
        <div className="mt-5 grid gap-4 border-t-2 border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base text-muted">Holdings</p>
            <p className="mt-1 text-xl font-semibold">{formatINR(holdingsValue)}</p>
          </div>
          <div>
            <p className="text-base text-muted">Free cash</p>
            <p className="mt-1 text-xl font-semibold">{formatINR(cashBalance)}</p>
            {marginBlocked > 0 ? (
              <p className="mt-1 text-sm text-muted">
                Margin blocked {formatINR(marginBlocked)}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-base text-muted">Unrealized P&L</p>
            <p className="mt-1 text-xl font-semibold">
              <Money value={metrics.unrealizedPl} signed />
            </p>
            <p className="mt-1 text-sm text-muted">
              <Pct value={metrics.unrealizedPlPct} /> on open positions
            </p>
          </div>
          <div>
            <p className="text-base text-muted">Realized P&L</p>
            <p className="mt-1 text-xl font-semibold">
              <Money value={metrics.realizedPl} signed />
            </p>
            <p className="mt-1 text-sm text-muted">
              Closed trades + booked history
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-base text-muted">Money put in</p>
            <p className="mt-1 text-xl font-semibold">
              {formatINR(netDeposits > 0 ? netDeposits : metrics.totalInvested)}
            </p>
          </div>
          <div>
            <p className="text-base text-muted">Account P&L (AUM − money in)</p>
            <p className="mt-1 text-xl font-semibold">
              <Money value={metrics.totalPl} signed />
            </p>
          </div>
        </div>
        {cashBalance < -1 ? (
          <p className="mt-4 text-base text-muted">
            Cash is negative because buys were funded without a recorded deposit.
            Add a deposit under Cash to match money you put into the account.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "holdings" as const, label: "Open positions" },
            { id: "cash" as const, label: "Cash" },
            { id: "booked" as const, label: "Booked P&L" },
            { id: "trades" as const, label: "Trade history" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setTab(t.id);
              setShowTaxDetails(false);
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          className={`btn ${showTaxDetails || tab === "lots" || tab === "gains" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => {
            setShowTaxDetails(true);
            setTab("lots");
          }}
        >
          Tax details
        </button>
      </div>

      {showTaxDetails ? (
        <div className="card space-y-4 p-5">
          <p className="text-lg text-muted">
            These numbers help with tax estimates. Confirm with your broker statement
            before filing.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-line p-4">
              <div className="text-base text-muted">
                Short-term gains · {data.realized.financialYear}
              </div>
              <div className="mt-1 text-2xl font-semibold">
                <Money value={data.realized.stcg.gainLoss} signed />
              </div>
            </div>
            <div className="rounded-2xl border-2 border-line p-4">
              <div className="text-base text-muted">
                Long-term gains · {data.realized.financialYear}
              </div>
              <div className="mt-1 text-2xl font-semibold">
                <Money value={data.realized.ltcg.gainLoss} signed />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`btn ${tab === "lots" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("lots")}
            >
              Purchase lots
            </button>
            <button
              className={`btn ${tab === "gains" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab("gains")}
            >
              Closed gains
            </button>
          </div>
        </div>
      ) : null}

      {tab === "cash" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              {editCashId ? "Edit cash entry" : "Add or remove cash"}
            </h2>
            <p className="text-base text-muted">
              Record money you transfer into or out of this account. Buys and sells
              update cash automatically.
            </p>
            <div>
              <label className="label">Deposit or withdrawal?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`btn ${cashType === "DEPOSIT" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setCashType("DEPOSIT")}
                >
                  Deposit
                </button>
                <button
                  type="button"
                  className={`btn ${cashType === "WITHDRAWAL" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setCashType("WITHDRAWAL")}
                >
                  Withdrawal
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="cash-amount">
                  Amount
                </label>
                <input
                  id="cash-amount"
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="label" htmlFor="cash-date">
                  Date
                </label>
                <input
                  id="cash-date"
                  className="input"
                  type="date"
                  value={cashDate}
                  onChange={(e) => setCashDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="cash-notes">
                  Notes (optional)
                </label>
                <input
                  id="cash-notes"
                  className="input"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder="Bank transfer"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={cashSaving}
                onClick={() => submitCash()}
              >
                {cashSaving
                  ? "Saving…"
                  : editCashId
                    ? "Save changes"
                    : cashType === "DEPOSIT"
                      ? "Add deposit"
                      : "Add withdrawal"}
              </button>
              {editCashId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={cashSaving}
                  onClick={resetCashForm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.cash?.transactions ?? [])
                  .slice()
                  .reverse()
                  .map((t) => (
                    <tr key={t.id}>
                      <td>
                        {new Date(t.executedAt).toLocaleDateString("en-IN")}
                      </td>
                      <td>
                        {t.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}
                      </td>
                      <td>{formatINR(t.amount)}</td>
                      <td className="text-muted">{t.notes || "—"}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost !px-2"
                            onClick={() => startEditCash(t)}
                            aria-label="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost !px-2"
                            onClick={() => removeCashTxn(t.id)}
                            aria-label="Remove"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {(data.cash?.transactions?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      No deposits or withdrawals yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "holdings" ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Avg cost</th>
                <th>Price now</th>
                <th>Value</th>
                <th>Profit / loss</th>
                <th>Today</th>
                <th>% of account</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => (
                <tr key={h.ticker}>
                  <td>
                    <Link href={`/insights?ticker=${h.ticker}`} className="font-semibold text-accent">
                      {h.ticker}
                    </Link>
                  </td>
                  <td className="text-base text-muted">
                    {h.instrumentType === "FUTURES" ? "Futures" : "Stock"}
                  </td>
                  <td>
                    {h.instrumentType === "FUTURES"
                      ? `${formatNumber(h.quantity, 4)} lots × ${h.lotSize}`
                      : formatNumber(h.quantity, 4)}
                  </td>
                  <td>{formatINR(h.avgCost)}</td>
                  <td>{formatINR(h.price)}</td>
                  <td>
                    {formatINR(h.marketValue)}
                    {h.instrumentType === "FUTURES" && h.notional != null ? (
                      <span className="mt-0.5 block text-sm text-muted">
                        Notional {formatINR(h.notional)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Money value={h.unrealized} signed />{" "}
                    <Pct value={h.unrealizedPct} className="text-xs" />
                  </td>
                  <td>
                    <Pct value={h.dayChangePct} />
                  </td>
                  <td>{h.weightPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "lots" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              className={`btn ${!lotTicker ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setLotTicker(null)}
            >
              All
            </button>
            {data.holdings.map((h) => (
              <button
                key={h.ticker}
                className={`btn ${lotTicker === h.ticker ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setLotTicker(h.ticker)}
              >
                {h.ticker}
              </button>
            ))}
          </div>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Acquired</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>Days held</th>
                  <th>Term</th>
                  <th>To LTCG</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings
                  .filter((h) => !lotTicker || h.ticker === lotTicker)
                  .flatMap((h) =>
                    h.lots.map((l) => (
                      <tr key={l.id}>
                        <td className="font-medium">{h.ticker}</td>
                        <td>{new Date(l.acquiredAt).toLocaleDateString("en-IN")}</td>
                        <td>{formatNumber(l.quantity, 4)}</td>
                        <td>{formatINR(l.costBasisPerShare)}</td>
                        <td>{l.daysHeld}</td>
                        <td>
                          <span
                            className={
                              l.term === "LTCG"
                                ? "rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
                                : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-warn"
                            }
                          >
                            {l.term}
                          </span>
                        </td>
                        <td>
                          {h.instrumentType === "FUTURES" || l.term === "LTCG" ? (
                            "—"
                          ) : l.daysToLongTerm <= 30 ? (
                            <span className="font-semibold text-warn">
                              {l.daysToLongTerm}d
                            </span>
                          ) : (
                            `${l.daysToLongTerm}d`
                          )}
                        </td>
                      </tr>
                    ))
                  )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "trades" ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Type</th>
                <th>Action</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Fees</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.executedAt).toLocaleString("en-IN")}</td>
                  <td className="font-medium">{t.ticker}</td>
                  <td className="text-xs uppercase text-muted">
                    {t.instrumentType === "FUTURES" ? "Futures" : "Equity"}
                  </td>
                  <td className={t.action === "BUY" ? "gain" : "loss"}>{t.action}</td>
                  <td>{formatNumber(t.quantity, 4)}</td>
                  <td>{formatINR(t.pricePerShare)}</td>
                  <td>{formatINR(t.fees)}</td>
                  <td className="space-x-1 text-right">
                    <button
                      className="btn btn-ghost !px-2"
                      onClick={() => {
                        setEditTrade(t);
                        setTradeOpen(true);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-ghost !px-2" onClick={() => deleteTrade(t.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "booked" ? (
        <div className="space-y-5">
          <div className="card space-y-4 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              {editBookedId ? "Edit booked P&L" : "Record booked P&L"}
            </h2>
            <p className="text-base text-muted">
              Use this for profits or losses already realized before you started
              tracking in Market Edge. This updates realized P&L only — it does not
              change cash or invent trades. Prefer{" "}
              <strong className="font-semibold text-ink">Other</strong> for prior
              history so it stays out of in-app tax estimates.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="booked-amount">
                  Amount (negative = loss)
                </label>
                <input
                  id="booked-amount"
                  className="input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={bookedAmount}
                  onChange={(e) => setBookedAmount(e.target.value)}
                  placeholder="250000"
                />
              </div>
              <div>
                <label className="label" htmlFor="booked-date">
                  Booked on
                </label>
                <input
                  id="booked-date"
                  className="input"
                  type="date"
                  value={bookedDate}
                  onChange={(e) => setBookedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="booked-label">
                  Label (optional)
                </label>
                <input
                  id="booked-label"
                  className="input"
                  value={bookedLabel}
                  onChange={(e) => setBookedLabel(e.target.value)}
                  placeholder="Prior FY / broker total"
                />
              </div>
              <div>
                <label className="label" htmlFor="booked-term">
                  Classification
                </label>
                <select
                  id="booked-term"
                  className="select"
                  value={bookedTerm}
                  onChange={(e) =>
                    setBookedTerm(e.target.value as "OTHER" | "STCG" | "LTCG")
                  }
                >
                  <option value="OTHER">Other (performance only)</option>
                  <option value="STCG">Short-term</option>
                  <option value="LTCG">Long-term</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="booked-notes">
                  Notes (optional)
                </label>
                <input
                  id="booked-notes"
                  className="input"
                  value={bookedNotes}
                  onChange={(e) => setBookedNotes(e.target.value)}
                  placeholder="Booked before Market Edge"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={bookedSaving}
                onClick={submitBooked}
              >
                {bookedSaving
                  ? "Saving…"
                  : editBookedId
                    ? "Save changes"
                    : "Add booked P&L"}
              </button>
              {editBookedId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={bookedSaving}
                  onClick={resetBookedForm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Booked</th>
                  <th>Label</th>
                  <th>Class</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.realizedAdjustments ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No booked P&L yet. Add prior profits here.
                    </td>
                  </tr>
                ) : (
                  (data.realizedAdjustments ?? []).map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.bookedAt).toLocaleDateString("en-IN")}</td>
                      <td className="font-medium">{a.label || "—"}</td>
                      <td>{a.term}</td>
                      <td>
                        <Money value={a.amount} signed />
                      </td>
                      <td className="text-muted">{a.notes || "—"}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost !px-2"
                            onClick={() => startEditBooked(a)}
                            aria-label="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost !px-2"
                            onClick={() => removeBooked(a.id)}
                            aria-label="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "gains" ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Closed</th>
                <th>Ticker</th>
                <th>Qty</th>
                <th>Term</th>
                <th>Gain/Loss</th>
              </tr>
            </thead>
            <tbody>
              {data.gains.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.closedAt).toLocaleDateString("en-IN")}</td>
                  <td className="font-medium">{g.ticker}</td>
                  <td>{formatNumber(g.quantity, 4)}</td>
                  <td>{g.term}</td>
                  <td>
                    <Money value={g.gainLoss} signed />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card p-4 md:p-5">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-semibold">
          Value over time
        </h2>
        <PortfolioValueChart snapshots={data.snapshots} />
      </div>

      <TradeForm
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        portfolioId={id}
        onSaved={load}
        initial={
          editTrade
            ? {
                id: editTrade.id,
                ticker: editTrade.ticker,
                action: editTrade.action,
                instrumentType: editTrade.instrumentType ?? "EQUITY",
                quantity: editTrade.quantity,
                lotSize: editTrade.lotSize ?? 1,
                margin: editTrade.margin ?? 0,
                pricePerShare: editTrade.pricePerShare,
                fees: editTrade.fees,
                executedAt: editTrade.executedAt,
                notes: editTrade.notes ?? undefined,
              }
            : undefined
        }
      />
    </div>
  );
}

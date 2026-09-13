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
    currentValue: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
    realizedPl: number;
    totalPl: number;
    dayChange: number;
    dayChangePct: number;
  };
  holdings: {
    ticker: string;
    instrumentType?: "EQUITY" | "FUTURES";
    quantity: number;
    avgCost: number;
    costBasis: number;
    price: number;
    marketValue: number;
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
  };
  realizedAllTime: {
    stcg: { gainLoss: number };
    ltcg: { gainLoss: number };
    total: number;
  };
  snapshots: { date: string; totalValue: number; totalCostBasis: number }[];
  trades: {
    id: string;
    ticker: string;
    action: "BUY" | "SELL";
    instrumentType?: "EQUITY" | "FUTURES";
    quantity: number;
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
  const [tab, setTab] = useState<"holdings" | "trades" | "lots" | "gains">("holdings");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<PortfolioPayload["trades"][0] | null>(null);
  const [lotTicker, setLotTicker] = useState<string | null>(null);
  const [showTaxDetails, setShowTaxDetails] = useState(false);

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

  if (!data) return <div className="text-lg text-muted">Loading account…</div>;

  const { portfolio, metrics } = data;

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
        <div className="mt-5 grid gap-4 border-t-2 border-line pt-5 sm:grid-cols-3">
          <div>
            <p className="text-base text-muted">Money put in</p>
            <p className="mt-1 text-xl font-semibold">{formatINR(metrics.totalInvested)}</p>
          </div>
          <div>
            <p className="text-base text-muted">Profit or loss</p>
            <p className="mt-1 text-xl font-semibold">
              <Money value={metrics.totalPl} signed />
            </p>
          </div>
          <div>
            <p className="text-base text-muted">Today</p>
            <p className="mt-1 text-xl font-semibold">
              <Money value={metrics.dayChange} signed />
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "holdings" as const, label: "What you own" },
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

      {tab === "holdings" ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Type</th>
                <th>Shares</th>
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
                  <td>{formatNumber(h.quantity, 4)}</td>
                  <td>{formatINR(h.avgCost)}</td>
                  <td>{formatINR(h.price)}</td>
                  <td>{formatINR(h.marketValue)}</td>
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

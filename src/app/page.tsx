"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Users } from "lucide-react";
import { ChangeBadge, Money } from "@/components/StatCard";
import { OverallPerformanceChart } from "@/components/OverallPerformanceChart";
import { cn, formatINR, formatPct } from "@/lib/utils";

type MemberRow = {
  id: string;
  name: string;
  contactInfo?: string | null;
  summary: {
    currentValue: number;
    totalInvested: number;
    totalPl: number;
    dayChange: number;
    portfolioCount: number;
  };
  portfolios: {
    id: string;
    name: string;
    type: string;
    metrics: {
      currentValue: number;
      totalPl: number;
      dayChange: number;
      unrealizedPlPct: number;
    };
  }[];
};

type DashboardData = {
  members: MemberRow[];
  aggregate: {
    aum: number;
    combinedPl: number;
    combinedDay: number;
    memberCount: number;
    portfolioCount: number;
  };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | "all">("all");
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/members");
    const text = await res.text();
    if (!res.ok || !text) {
      console.error("Failed to load members", res.status, text);
      setLoading(false);
      return;
    }
    try {
      setData(JSON.parse(text));
    } catch (e) {
      console.error("Invalid members JSON", e, text.slice(0, 200));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(async () => {
      await fetch("/api/quotes?force=1");
      load();
    }, 60000);
    return () => clearInterval(id);
  }, [load]);

  async function refreshQuotes() {
    setRefreshing(true);
    try {
      await fetch("/api/quotes?force=1");
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contactInfo: contact }),
    });
    const created = await res.json();
    setName("");
    setContact("");
    setShowMemberForm(false);
    await load();
    if (created?.id) setSelectedId(created.id);
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.members.filter((m) =>
      m.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [data, query]);

  const selectedMember =
    selectedId === "all"
      ? null
      : data?.members.find((m) => m.id === selectedId) ?? null;

  if (loading || !data) {
    return <div className="text-lg text-muted">Loading…</div>;
  }

  const overallInvested = data.members.reduce(
    (s, m) => s + m.summary.totalInvested,
    0
  );

  const viewStats = selectedMember
    ? {
        aum: selectedMember.summary.currentValue,
        pl: selectedMember.summary.totalPl,
        day: selectedMember.summary.dayChange,
        invested: selectedMember.summary.totalInvested,
      }
    : {
        aum: data.aggregate.aum,
        pl: data.aggregate.combinedPl,
        day: data.aggregate.combinedDay,
        invested: overallInvested,
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight md:text-4xl">
            {selectedMember ? selectedMember.name : "Dashboard"}
          </h1>
          <p className="mt-2 max-w-xl text-lg text-muted">
            {selectedMember
              ? "Here’s how this person’s money is doing today."
              : "Here’s the big picture for everyone you manage."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-ghost"
            onClick={refreshQuotes}
            disabled={refreshing}
          >
            <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} />
            Update prices
          </button>
          <button className="btn btn-primary" onClick={() => setShowMemberForm(true)}>
            <Plus size={20} />
            Add person
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card flex max-h-[70vh] flex-col overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">
          <div className="border-b-2 border-line p-4">
            <label className="label" htmlFor="member-search">
              Find a person
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={18}
              />
              <input
                id="member-search"
                className="input !pl-10"
                placeholder="Type a name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <button
              type="button"
              onClick={() => setSelectedId("all")}
              className={cn(
                "mb-2 flex min-h-16 w-full flex-col justify-center rounded-2xl px-4 py-3 text-left transition-colors",
                selectedId === "all"
                  ? "bg-accent text-white"
                  : "text-ink hover:bg-accent-soft"
              )}
            >
              <span className="flex items-center gap-2 text-lg font-semibold">
                <Users size={22} />
                Everyone
              </span>
              <span
                className={cn(
                  "mt-1 flex flex-wrap items-baseline gap-x-2 text-base",
                  selectedId === "all" ? "text-white/85" : "text-muted"
                )}
              >
                <span>{formatINR(data.aggregate.aum, true)}</span>
                <span aria-hidden>·</span>
                <span
                  className={
                    selectedId === "all"
                      ? ""
                      : data.aggregate.combinedPl >= 0
                        ? "gain"
                        : "loss"
                  }
                >
                  {formatPct(
                    overallInvested > 0
                      ? (data.aggregate.combinedPl / overallInvested) * 100
                      : 0
                  )}{" "}
                  return
                </span>
              </span>
            </button>
            {filtered.map((m) => {
              const retPct =
                m.summary.totalInvested > 0
                  ? (m.summary.totalPl / m.summary.totalInvested) * 100
                  : 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={cn(
                    "mb-1.5 flex min-h-16 w-full flex-col justify-center rounded-2xl px-4 py-3 text-left transition-colors",
                    selectedId === m.id
                      ? "bg-accent text-white"
                      : "hover:bg-accent-soft"
                  )}
                >
                  <span className="text-lg font-semibold">{m.name}</span>
                  <span
                    className={cn(
                      "mt-1 flex flex-wrap items-baseline gap-x-2 text-base",
                      selectedId === m.id ? "text-white/85" : "text-muted"
                    )}
                  >
                    <span>{formatINR(m.summary.currentValue, true)}</span>
                    <span aria-hidden>·</span>
                    <span
                      className={
                        selectedId === m.id
                          ? ""
                          : retPct >= 0
                            ? "gain"
                            : "loss"
                      }
                    >
                      {formatPct(retPct)} return
                    </span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-base text-muted">
                No matching names
              </p>
            ) : null}
          </div>
        </aside>

        <div className="space-y-5 min-w-0">
          <div className="card p-6 md:p-8">
            <p className="text-lg font-semibold text-muted">Total value today</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight md:text-5xl">
              {formatINR(viewStats.aum)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ChangeBadge value={viewStats.day} asMoney />
              <span className="text-base text-muted">today</span>
            </div>
            <div className="mt-5 border-t-2 border-line pt-5">
              <p className="text-base text-muted">Profit or loss overall</p>
              <p className="mt-1 text-2xl font-semibold">
                <Money value={viewStats.pl} signed />
                {viewStats.invested > 0 ? (
                  <span className="ml-2 text-lg text-muted">
                    ({formatPct((viewStats.pl / viewStats.invested) * 100)} return)
                  </span>
                ) : null}
              </p>
            </div>
            {selectedMember ? (
              <div className="mt-5">
                <a
                  href={`/members/${selectedMember.id}`}
                  className="text-base font-semibold text-accent underline"
                >
                  Manage this person
                </a>
              </div>
            ) : null}
          </div>

          <OverallPerformanceChart
            memberId={selectedId === "all" ? null : selectedId}
          />
        </div>
      </div>

      {showMemberForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6">
          <form
            onSubmit={createMember}
            className="card w-full max-w-md space-y-4 rounded-t-2xl p-5 md:rounded-2xl"
          >
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
              Add a person
            </h2>
            <div>
              <label className="label" htmlFor="new-member-name">
                Full name
              </label>
              <input
                id="new-member-name"
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-member-contact">
                Phone or email (optional)
              </label>
              <input
                id="new-member-contact"
                className="input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowMemberForm(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

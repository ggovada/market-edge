"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { Money } from "@/components/StatCard";

export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<{
    id: string;
    name: string;
    contactInfo?: string | null;
    notes?: string | null;
    portfolios: {
      id: string;
      name: string;
      type: string;
      metrics: { currentValue: number; totalPl: number; dayChange: number };
    }[];
    summary: { currentValue: number; totalPl: number };
  } | null>(null);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [pName, setPName] = useState("");
  const [pType, setPType] = useState("demat");
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const res = await fetch("/api/members");
    const data = await res.json();
    const m = data.members.find((x: { id: string }) => x.id === id);
    setMember(m ?? null);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function createPortfolio(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id, name: pName, type: pType }),
    });
    setShowPortfolio(false);
    setPName("");
    load();
  }

  async function deletePerson() {
    if (
      !confirm(
        `Delete ${member?.name}? This permanently removes this person and all of their accounts and trades.`
      )
    ) {
      return;
    }
    if (!confirm("Are you sure? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/");
    } catch {
      alert("Could not delete this person. Please try again.");
      setDeleting(false);
    }
  }

  async function deletePortfolio(portfolioId: string, portfolioName: string) {
    if (
      !confirm(
        `Delete account “${portfolioName}”? This permanently removes its trades and holdings.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/portfolios/${portfolioId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Could not delete this account. Please try again.");
      return;
    }
    load();
  }

  if (!member) return <div className="text-lg text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-base font-medium text-accent underline">
          ← Dashboard
        </Link>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold md:text-4xl">
              {member.name}
            </h1>
            {member.contactInfo ? (
              <p className="mt-1 text-lg text-muted">{member.contactInfo}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-5 text-base">
              <div>
                <span className="text-muted">Value </span>
                <span className="font-semibold">
                  {formatINR(member.summary.currentValue)}
                </span>
              </div>
              <div>
                <span className="text-muted">Profit / loss </span>
                <Money value={member.summary.totalPl} signed className="font-semibold" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-ghost"
              onClick={deletePerson}
              disabled={deleting}
            >
              <Trash2 size={18} />
              {deleting ? "Deleting…" : "Delete person"}
            </button>
            <button className="btn btn-primary" onClick={() => setShowPortfolio(true)}>
              <Plus size={18} /> Add account
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {member.portfolios.length === 0 ? (
          <div className="card p-8 text-center text-lg text-muted">
            No accounts yet. Add a stocks, futures, or mutual-fund account.
          </div>
        ) : (
          member.portfolios.map((p) => (
            <div
              key={p.id}
              className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link href={`/portfolios/${p.id}`} className="min-w-0 flex-1">
                <div className="text-lg font-semibold">{p.name}</div>
                <div className="text-base capitalize text-muted">{p.type}</div>
              </Link>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {formatINR(p.metrics.currentValue)}
                  </div>
                  <Money value={p.metrics.totalPl} signed className="text-base" />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost !px-3"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => deletePortfolio(p.id, p.name)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showPortfolio ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6">
          <form
            onSubmit={createPortfolio}
            className="card w-full max-w-md space-y-4 rounded-t-2xl p-5 md:rounded-2xl"
          >
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
              New account
            </h2>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Example: Zerodha demat"
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="select"
                value={pType}
                onChange={(e) => setPType(e.target.value)}
              >
                <option value="demat">Cash / stocks (demat)</option>
                <option value="futures">Futures &amp; options</option>
                <option value="mutual-fund">Mutual fund</option>
                <option value="mixed">Mixed (stocks + futures)</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowPortfolio(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

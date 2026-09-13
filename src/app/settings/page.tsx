"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/lib/utils";

type TaxSettings = {
  id: string;
  jurisdiction: string;
  stcgRatePct: number;
  ltcgRatePct: number;
  ltcgExemptionAmountPerFY: number;
  longTermThresholdDays: number;
  effectiveFrom: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<TaxSettings[]>([]);
  const [active, setActive] = useState<TaxSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/tax-settings");
    const data = await res.json();
    setSettings(data);
    setActive(data[0] ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    await fetch("/api/tax-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(active),
    });
    setSaving(false);
    load();
  }

  async function runSnapshot() {
    const res = await fetch("/api/snapshots", { method: "POST" });
    const data = await res.json();
    setSnapshotMsg(res.ok ? `Snapshot saved at ${data.at}` : "Snapshot failed");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Indian equity capital-gains rates are configurable so Budget changes
          don’t require a code deploy. Defaults match post–23 Jul 2024 rules
          (STCG 20%, LTCG 12.5%, ₹1.25L FY exemption).
        </p>
      </div>

      {active ? (
        <form onSubmit={save} className="card max-w-xl space-y-3 p-4 md:p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Tax settings ({active.jurisdiction})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">STCG rate %</label>
              <input
                className="input"
                type="number"
                step="any"
                value={active.stcgRatePct}
                onChange={(e) =>
                  setActive({ ...active, stcgRatePct: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">LTCG rate %</label>
              <input
                className="input"
                type="number"
                step="any"
                value={active.ltcgRatePct}
                onChange={(e) =>
                  setActive({ ...active, ltcgRatePct: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">LTCG exemption / FY</label>
              <input
                className="input"
                type="number"
                step="any"
                value={active.ltcgExemptionAmountPerFY}
                onChange={(e) =>
                  setActive({
                    ...active,
                    ltcgExemptionAmountPerFY: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Long-term threshold (days)</label>
              <input
                className="input"
                type="number"
                value={active.longTermThresholdDays}
                onChange={(e) =>
                  setActive({
                    ...active,
                    longTermThresholdDays: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Current exemption preview: {formatINR(active.ltcgExemptionAmountPerFY)} per
            member per financial year (Apr–Mar).
          </p>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save tax settings"}
          </button>
        </form>
      ) : null}

      <div className="card max-w-xl space-y-3 p-4 md:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Daily value snapshot
        </h2>
        <p className="text-sm text-muted">
          Records each portfolio’s value for historical charts. On Vercel this also
          runs daily via cron at{" "}
          <code className="rounded bg-accent-soft px-1">/api/cron/snapshot</code>
          . You can run one now:
        </p>
        <button className="btn btn-ghost" onClick={runSnapshot}>
          Snapshot now
        </button>
        {snapshotMsg ? <p className="text-sm text-accent">{snapshotMsg}</p> : null}
      </div>

      <div className="card max-w-xl space-y-2 p-4 md:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Environment
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            Charts AI uses algorithmic support/resistance plus Yahoo-sourced news
            and analyst ratings (no API key required)
          </li>
          <li>
            <code>DATABASE_URL</code> — SQLite by default; switch to Postgres for
            production
          </li>
          <li>
            <code>CRON_SECRET</code> — protect the snapshot endpoint in production
          </li>
        </ul>
        {settings.length > 1 ? (
          <p className="pt-2 text-xs text-muted">
            {settings.length} tax setting revisions on file.
          </p>
        ) : null}
      </div>
    </div>
  );
}

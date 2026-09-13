"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatINR } from "@/lib/utils";

type Member = {
  id: string;
  name: string;
  contactInfo?: string | null;
  notes?: string | null;
  portfolios: { id: string; name: string }[];
  summary?: { currentValue: number; totalPl: number };
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    const res = await fetch("/api/members");
    const data = await res.json();
    setMembers(data.members);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contactInfo: contact, notes }),
    });
    setShowForm(false);
    setName("");
    setContact("");
    setNotes("");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold md:text-4xl">
            People
          </h1>
          <p className="mt-2 text-lg text-muted">
            Everyone whose money you look after.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={20} /> Add person
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <Link key={m.id} href={`/members/${m.id}`} className="card block p-4 transition hover:border-accent">
            <div className="font-[family-name:var(--font-display)] text-xl font-semibold">
              {m.name}
            </div>
            <div className="mt-1 text-sm text-muted">
              {m.portfolios.length} portfolio{m.portfolios.length === 1 ? "" : "s"}
            </div>
            {m.summary ? (
              <div className="mt-3 text-sm font-medium">
                {formatINR(m.summary.currentValue)}
              </div>
            ) : null}
          </Link>
        ))}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-6">
          <form onSubmit={create} className="card w-full max-w-md space-y-3 rounded-t-2xl p-4 md:rounded-2xl">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">New member</h2>
            <div>
              <label className="label">Name</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Contact</label>
              <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit">Create</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

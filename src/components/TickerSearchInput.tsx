"use client";

import { useEffect, useRef, useState } from "react";

export type TickerSearchHit = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  lotSize?: number;
  expiry?: string;
};

type Props = {
  id?: string;
  label?: string;
  placeholder?: string;
  /** Selected Yahoo/NSE symbol (e.g. DIVISLAB.NS) */
  value: string;
  onChange: (symbol: string, hit?: TickerSearchHit) => void;
  instrumentType?: "EQUITY" | "FUTURES" | "ALL";
  /** When true, show “Selected ticker: …” help text */
  showSelectedHint?: boolean;
  autoFocus?: boolean;
};

export function TickerSearchInput({
  id = "ticker-search",
  label = "Stock symbol",
  placeholder = "Try: Reliance, Infosys, HDFC Bank",
  value,
  onChange,
  instrumentType = "EQUITY",
  showSelectedHint = true,
  autoFocus = false,
}: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<TickerSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pickedRef = useRef(false);

  // Keep query in sync when parent sets ticker externally (e.g. ?ticker=)
  useEffect(() => {
    if (!pickedRef.current) setQuery(value);
    pickedRef.current = false;
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
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
  }, [query, instrumentType]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setShowSuggestions(true);
          const raw = next.trim();
          if (/^[A-Za-z0-9.:^*=-]+$/.test(raw) && raw.length >= 2) {
            onChange(raw.toUpperCase());
          } else if (!raw) {
            onChange("");
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
                  pickedRef.current = true;
                  setQuery(hit.name);
                  onChange(hit.symbol, hit);
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
      ) : showSuggestions && query.trim().length >= 2 && !searchLoading ? (
        <p className="help">
          No matches. Try another name, or type the ticker directly (example:
          RELIANCE.NS).
        </p>
      ) : null}
      {showSelectedHint && value ? (
        <p className="help mt-2">
          Selected ticker: <strong>{value}</strong>
        </p>
      ) : null}
    </div>
  );
}

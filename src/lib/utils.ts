import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 100000) {
    if (Math.abs(value) >= 10000000) {
      return `₹${(value / 10000000).toFixed(2)} Cr`;
    }
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(value);
}

/** Indian financial year: Apr 1 – Mar 31. Returns e.g. "FY2025-26" */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  if (month >= 3) {
    return `FY${year}-${String(year + 1).slice(-2)}`;
  }
  return `FY${year - 1}-${String(year).slice(-2)}`;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

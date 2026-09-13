import { NextResponse } from "next/server";
import { snapshotAllPortfolios } from "@/lib/portfolio/metrics";

/** Manual “Snapshot now” from Settings (no cron secret). */
export async function POST() {
  try {
    await snapshotAllPortfolios();
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    console.error("manual snapshot failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}

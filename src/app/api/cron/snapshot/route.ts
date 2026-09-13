import { NextResponse } from "next/server";
import { snapshotAllPortfolios } from "@/lib/portfolio/metrics";

/**
 * Daily portfolio value snapshot.
 * Vercel Cron: GET /api/cron/snapshot (see vercel.json).
 * When CRON_SECRET is set, Vercel sends Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" || secret) {
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 500 }
      );
    }
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await snapshotAllPortfolios();
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    console.error("snapshot cron failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}

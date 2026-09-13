import { NextResponse } from "next/server";
import {
  buildOverallPerformance,
  type PerformanceRange,
} from "@/lib/portfolio/performance";

const ALLOWED: PerformanceRange[] = [
  "1D",
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "5Y",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = (searchParams.get("range") ?? "1M").toUpperCase() as PerformanceRange;
  const memberId = searchParams.get("memberId") ?? undefined;

  if (!ALLOWED.includes(range)) {
    return NextResponse.json(
      { error: `range must be one of ${ALLOWED.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const series = await buildOverallPerformance(range, { memberId });
    return NextResponse.json(series);
  } catch (e) {
    console.error("GET /api/performance", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build performance" },
      { status: 500 }
    );
  }
}

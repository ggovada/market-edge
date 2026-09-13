import { NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market/yahoo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const interval = (searchParams.get("interval") ?? "1d") as "1d" | "1wk";
  const period = searchParams.get("period") ?? (interval === "1wk" ? "3y" : "1y");

  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();
    const candles = await provider.getHistory(ticker.toUpperCase(), interval, period);
    return NextResponse.json({ ticker: ticker.toUpperCase(), interval, period, candles });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 502 });
  }
}

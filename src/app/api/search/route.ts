import { NextResponse } from "next/server";
import { searchTickers } from "@/lib/market/search";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const typeParam = (searchParams.get("type") ?? "ALL").toUpperCase();
  const type =
    typeParam === "EQUITY" || typeParam === "FUTURES" ? typeParam : "ALL";

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchTickers(q, type);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("search route failed", err);
    return NextResponse.json(
      { error: "Search failed", results: [] },
      { status: 500 }
    );
  }
}

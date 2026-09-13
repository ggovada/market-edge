import Anthropic from "@anthropic-ai/sdk";
import type { PivotLevel } from "@/lib/technical/levels";

export async function narrateLevels(params: {
  ticker: string;
  timeframe: "DAILY" | "WEEKLY";
  levels: PivotLevel[];
  summary: {
    lastClose: number;
    change30d: number;
    change90d: number;
    high52?: number;
    low52?: number;
    trend: string;
  };
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackNarrative(params);
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `You are a technical analyst writing a brief, clear interpretation of pre-computed support/resistance levels. Do NOT invent new price levels — only narrate and rank the levels provided. This is informational technical analysis, not financial advice. Keep it under 220 words.

Ticker: ${params.ticker}
Timeframe: ${params.timeframe}
Last close: ${params.summary.lastClose}
30d change: ${params.summary.change30d}%
90d change: ${params.summary.change90d}%
Trend: ${params.summary.trend}
52w high/low: ${params.summary.high52 ?? "n/a"} / ${params.summary.low52 ?? "n/a"}

Computed levels (JSON):
${JSON.stringify(params.levels, null, 2)}

Rank the 3–5 most meaningful levels and explain why (touches, alignment with SMAs, proximity to price). End with one sentence disclaimer that this is not investment advice.`,
        },
      ],
    });

    const block = message.content.find((c) => c.type === "text");
    return block && block.type === "text" ? block.text : fallbackNarrative(params);
  } catch (err) {
    console.error("Anthropic narrative failed", err);
    return fallbackNarrative(params);
  }
}

function fallbackNarrative(params: {
  ticker: string;
  timeframe: string;
  levels: PivotLevel[];
  summary: { lastClose: number; trend: string; change30d: number };
}): string {
  const supports = params.levels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  const resistances = params.levels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  const lines: string[] = [];
  lines.push(
    `${params.ticker} (${params.timeframe.toLowerCase()}) is currently ${params.summary.trend} near ${params.summary.lastClose} (${params.summary.change30d >= 0 ? "+" : ""}${params.summary.change30d}% over ~30 sessions).`
  );

  if (supports.length) {
    lines.push(
      `Stronger support zones: ${supports
        .map(
          (s) =>
            `${s.price} (strength ${s.strength}, ${s.touches} touches${s.sources.includes("SMA50") || s.sources.includes("SMA200") ? `, aligns with ${s.sources.filter((x) => x.startsWith("SMA")).join("/")}` : ""})`
        )
        .join("; ")}.`
    );
  }
  if (resistances.length) {
    lines.push(
      `Notable resistance: ${resistances
        .map((r) => `${r.price} (strength ${r.strength}, ${r.touches} touches)`)
        .join("; ")}.`
    );
  }
  lines.push(
    "Levels were computed from swing pivots, volume clusters, and moving averages — AI narration unavailable without ANTHROPIC_API_KEY. Informational only; not financial advice."
  );
  return lines.join(" ");
}

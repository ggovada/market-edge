import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type OutletSignal = {
  outlet: string;
  signal: "Buy" | "Sell" | "Hold" | "Bullish" | "Bearish" | "Neutral";
  detail: string;
  asOf?: string;
};

function mapGrade(grade: string): OutletSignal["signal"] {
  const g = grade.toLowerCase();
  if (
    g.includes("strong buy") ||
    g === "buy" ||
    g === "outperform" ||
    g === "overweight" ||
    g === "accumulate" ||
    g === "positive"
  ) {
    return "Buy";
  }
  if (
    g.includes("strong sell") ||
    g === "sell" ||
    g === "underperform" ||
    g === "underweight" ||
    g === "reduce" ||
    g === "negative"
  ) {
    return "Sell";
  }
  if (g.includes("bull")) return "Bullish";
  if (g.includes("bear")) return "Bearish";
  return "Hold";
}

function consensusLabel(key?: string | null): OutletSignal["signal"] {
  const k = (key ?? "").toLowerCase();
  if (k.includes("strong_buy") || k === "buy") return "Buy";
  if (k.includes("strong_sell") || k === "sell") return "Sell";
  return "Hold";
}

/**
 * Up to 5 buy/sell/hold-style signals from major Yahoo-sourced outlets.
 */
export async function getOutletSignals(ticker: string, limit = 5): Promise<OutletSignal[]> {
  const symbol = ticker.trim().toUpperCase();
  const signals: OutletSignal[] = [];
  const seen = new Set<string>();

  const push = (s: OutletSignal) => {
    const key = s.outlet.toLowerCase();
    if (seen.has(key) || signals.length >= limit) return;
    seen.add(key);
    signals.push(s);
  };

  try {
    const qs = await yahooFinance.quoteSummary(symbol, {
      modules: ["financialData", "recommendationTrend", "upgradeDowngradeHistory"],
    });

    const fin = qs.financialData;
    if (fin?.recommendationKey) {
      const n = fin.numberOfAnalystOpinions;
      push({
        outlet: "Yahoo Finance (street consensus)",
        signal: consensusLabel(fin.recommendationKey),
        detail: `Mean score ${fin.recommendationMean?.toFixed(2) ?? "n/a"} (1=Strong Buy … 5=Sell)${
          n ? ` · ${n} analysts` : ""
        }`,
      });
    }

    const trend = qs.recommendationTrend?.trend?.[0];
    if (trend) {
      const total =
        (trend.strongBuy ?? 0) +
        (trend.buy ?? 0) +
        (trend.hold ?? 0) +
        (trend.sell ?? 0) +
        (trend.strongSell ?? 0);
      if (total > 0) {
        const bullish = (trend.strongBuy ?? 0) + (trend.buy ?? 0);
        const bearish = (trend.sell ?? 0) + (trend.strongSell ?? 0);
        const signal: OutletSignal["signal"] =
          bullish >= bearish && bullish >= (trend.hold ?? 0)
            ? "Buy"
            : bearish > bullish
              ? "Sell"
              : "Hold";
        push({
          outlet: "Analyst poll (Yahoo)",
          signal,
          detail: `${trend.strongBuy ?? 0} strong buy · ${trend.buy ?? 0} buy · ${trend.hold ?? 0} hold · ${trend.sell ?? 0} sell · ${trend.strongSell ?? 0} strong sell`,
        });
      }
    }

    const history = qs.upgradeDowngradeHistory?.history ?? [];
    for (const h of history) {
      if (!h.firm || !h.toGrade) continue;
      push({
        outlet: h.firm,
        signal: mapGrade(h.toGrade),
        detail: `${h.toGrade}${h.currentPriceTarget ? ` · PT ${h.currentPriceTarget}` : ""}${
          h.action === "up" ? " (upgrade)" : h.action === "down" ? " (downgrade)" : ""
        }`,
        asOf: h.epochGradeDate ? new Date(h.epochGradeDate).toISOString() : undefined,
      });
      if (signals.length >= limit) break;
    }
  } catch (err) {
    console.error("quoteSummary signals failed", symbol, err);
  }

  try {
    const insights = await yahooFinance.insights(symbol);

    if (insights.recommendation?.rating) {
      push({
        outlet: insights.recommendation.provider || "Argus Research",
        signal: mapGrade(insights.recommendation.rating),
        detail: `Rating ${insights.recommendation.rating}${
          insights.recommendation.targetPrice
            ? ` · target ${insights.recommendation.targetPrice}`
            : ""
        }`,
      });
    }

    const tech = insights.instrumentInfo?.technicalEvents;
    if (tech?.shortTermOutlook?.direction) {
      const d = tech.shortTermOutlook.direction;
      push({
        outlet: "Trading Central (short-term)",
        signal: d === "Bullish" ? "Bullish" : d === "Bearish" ? "Bearish" : "Neutral",
        detail:
          tech.shortTermOutlook.scoreDescription ||
          tech.shortTermOutlook.stateDescription ||
          d,
      });
    }

    for (const report of insights.reports ?? []) {
      if (!report.provider || !report.investmentRating) continue;
      push({
        outlet: report.provider,
        signal: mapGrade(report.investmentRating),
        detail: report.title || report.investmentRating,
        asOf: report.reportDate ? new Date(report.reportDate).toISOString() : undefined,
      });
      if (signals.length >= limit) break;
    }
  } catch (err) {
    console.error("insights signals failed", symbol, err);
  }

  return signals.slice(0, limit);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computePortfolioMetrics } from "@/lib/portfolio/metrics";

export async function GET() {
  const members = await prisma.member.findMany({
    include: { portfolios: true },
  });

  const rows = await Promise.all(
    members.map(async (m) => {
      const metrics = await Promise.all(
        m.portfolios.map((p) => computePortfolioMetrics(p.id))
      );
      const totalPl = metrics.reduce((s, x) => s + x.totalPl, 0);
      const invested = metrics.reduce((s, x) => s + x.totalInvested, 0);
      const value = metrics.reduce((s, x) => s + x.currentValue, 0);
      return {
        memberId: m.id,
        name: m.name,
        totalPl,
        totalPlPct: invested > 0 ? (totalPl / invested) * 100 : 0,
        currentValue: value,
        totalInvested: invested,
      };
    })
  );

  rows.sort((a, b) => b.totalPlPct - a.totalPlPct);
  return NextResponse.json(rows);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaultTaxSettings } from "@/lib/tax/engine";
import { computePortfolioMetrics } from "@/lib/portfolio/metrics";
import { getMemberLtcgExemption } from "@/lib/tax/engine";

export async function GET() {
  try {
    await ensureDefaultTaxSettings();

    const members = await prisma.member.findMany({
      include: {
        portfolios: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    const enriched = await Promise.all(
      members.map(async (m) => {
        const portfolioMetrics = await Promise.all(
          m.portfolios.map(async (p) => {
            const metrics = await computePortfolioMetrics(p.id);
            return { ...p, metrics };
          })
        );
        const currentValue = portfolioMetrics.reduce((s, p) => s + p.metrics.currentValue, 0);
        const totalInvested = portfolioMetrics.reduce((s, p) => s + p.metrics.totalInvested, 0);
        const totalPl = portfolioMetrics.reduce((s, p) => s + p.metrics.totalPl, 0);
        const dayChange = portfolioMetrics.reduce((s, p) => s + p.metrics.dayChange, 0);
        const ltcg = await getMemberLtcgExemption(m.id);

        return {
          ...m,
          portfolios: portfolioMetrics,
          summary: {
            currentValue,
            totalInvested,
            totalPl,
            dayChange,
            portfolioCount: m.portfolios.length,
          },
          ltcgExemption: ltcg,
        };
      })
    );

    const aum = enriched.reduce((s, m) => s + m.summary.currentValue, 0);
    const combinedPl = enriched.reduce((s, m) => s + m.summary.totalPl, 0);
    const combinedDay = enriched.reduce((s, m) => s + m.summary.dayChange, 0);

    return NextResponse.json({
      members: enriched,
      aggregate: {
        aum,
        combinedPl,
        combinedDay,
        memberCount: enriched.length,
        portfolioCount: enriched.reduce((s, m) => s + m.summary.portfolioCount, 0),
      },
    });
  } catch (e) {
    console.error("GET /api/members", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load members" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const member = await prisma.member.create({
    data: {
      name: body.name.trim(),
      contactInfo: body.contactInfo ?? null,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(member, { status: 201 });
}

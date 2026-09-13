import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaultTaxSettings } from "@/lib/tax/engine";

export async function GET() {
  await ensureDefaultTaxSettings();
  const settings = await prisma.taxSettings.findMany({
    orderBy: { effectiveFrom: "desc" },
  });
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const body = await req.json();
  const settings = await prisma.taxSettings.create({
    data: {
      jurisdiction: body.jurisdiction ?? "IN",
      stcgRatePct: Number(body.stcgRatePct ?? 20),
      ltcgRatePct: Number(body.ltcgRatePct ?? 12.5),
      ltcgExemptionAmountPerFY: Number(body.ltcgExemptionAmountPerFY ?? 125000),
      longTermThresholdDays: Number(body.longTermThresholdDays ?? 365),
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    },
  });
  return NextResponse.json(settings, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const settings = await prisma.taxSettings.update({
    where: { id: body.id },
    data: {
      ...(body.stcgRatePct != null && { stcgRatePct: Number(body.stcgRatePct) }),
      ...(body.ltcgRatePct != null && { ltcgRatePct: Number(body.ltcgRatePct) }),
      ...(body.ltcgExemptionAmountPerFY != null && {
        ltcgExemptionAmountPerFY: Number(body.ltcgExemptionAmountPerFY),
      }),
      ...(body.longTermThresholdDays != null && {
        longTermThresholdDays: Number(body.longTermThresholdDays),
      }),
    },
  });
  return NextResponse.json(settings);
}

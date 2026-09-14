import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createRealizedPlAdjustment,
  deleteRealizedPlAdjustment,
  listRealizedPlAdjustments,
  updateRealizedPlAdjustment,
} from "@/lib/portfolio/realized-adjustments";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const portfolio = await prisma.portfolio.findUnique({ where: { id } });
  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const adjustments = await listRealizedPlAdjustments(id);
  return NextResponse.json({ adjustments });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const portfolio = await prisma.portfolio.findUnique({ where: { id } });
  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  try {
    const adjustment = await createRealizedPlAdjustment({
      portfolioId: id,
      amount: Number(body.amount),
      bookedAt: body.bookedAt ?? new Date().toISOString(),
      label: body.label,
      term: body.term,
      notes: body.notes,
    });
    const adjustments = await listRealizedPlAdjustments(id);
    return NextResponse.json({ adjustment, adjustments }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: portfolioId } = await ctx.params;
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.realizedPlAdjustment.findFirst({
    where: { id: body.id, portfolioId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const adjustment = await updateRealizedPlAdjustment(body.id, {
      amount: body.amount != null ? Number(body.amount) : undefined,
      bookedAt: body.bookedAt,
      label: body.label,
      term: body.term,
      notes: body.notes,
    });
    const adjustments = await listRealizedPlAdjustments(portfolioId);
    return NextResponse.json({ adjustment, adjustments });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id: portfolioId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const adjId = searchParams.get("id");
  if (!adjId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const existing = await prisma.realizedPlAdjustment.findFirst({
    where: { id: adjId, portfolioId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteRealizedPlAdjustment(adjId);
  const adjustments = await listRealizedPlAdjustments(portfolioId);
  return NextResponse.json({ adjustments });
}

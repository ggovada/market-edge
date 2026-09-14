import { prisma } from "@/lib/db";
import { getFinancialYear } from "@/lib/utils";

export type RealizedPlTerm = "STCG" | "LTCG" | "OTHER";

function parseTerm(raw: string | undefined | null): RealizedPlTerm {
  const t = (raw ?? "OTHER").toUpperCase();
  if (t === "STCG" || t === "LTCG" || t === "OTHER") return t;
  throw new Error("term must be STCG, LTCG, or OTHER");
}

export async function listRealizedPlAdjustments(portfolioId: string) {
  return prisma.realizedPlAdjustment.findMany({
    where: { portfolioId },
    orderBy: [{ bookedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function createRealizedPlAdjustment(input: {
  portfolioId: string;
  amount: number;
  bookedAt: string | Date;
  label?: string | null;
  term?: string | null;
  notes?: string | null;
}) {
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("amount must be a non-zero number (use negative for losses)");
  }
  const bookedAt = new Date(input.bookedAt);
  if (Number.isNaN(bookedAt.getTime())) {
    throw new Error("bookedAt must be a valid date");
  }

  return prisma.realizedPlAdjustment.create({
    data: {
      portfolioId: input.portfolioId,
      amount: input.amount,
      bookedAt,
      label: input.label?.trim() || null,
      term: parseTerm(input.term),
      notes: input.notes?.trim() || null,
    },
  });
}

export async function updateRealizedPlAdjustment(
  id: string,
  input: {
    amount?: number;
    bookedAt?: string | Date;
    label?: string | null;
    term?: string | null;
    notes?: string | null;
  }
) {
  const data: {
    amount?: number;
    bookedAt?: Date;
    label?: string | null;
    term?: RealizedPlTerm;
    notes?: string | null;
  } = {};

  if (input.amount != null) {
    if (!Number.isFinite(input.amount) || input.amount === 0) {
      throw new Error("amount must be a non-zero number (use negative for losses)");
    }
    data.amount = input.amount;
  }
  if (input.bookedAt != null) {
    const bookedAt = new Date(input.bookedAt);
    if (Number.isNaN(bookedAt.getTime())) {
      throw new Error("bookedAt must be a valid date");
    }
    data.bookedAt = bookedAt;
  }
  if (input.label !== undefined) {
    data.label = input.label?.trim() || null;
  }
  if (input.term != null) {
    data.term = parseTerm(input.term);
  }
  if (input.notes !== undefined) {
    data.notes = input.notes?.trim() || null;
  }

  return prisma.realizedPlAdjustment.update({ where: { id }, data });
}

export async function deleteRealizedPlAdjustment(id: string) {
  return prisma.realizedPlAdjustment.delete({ where: { id } });
}

export async function sumRealizedPlAdjustments(
  portfolioId: string,
  financialYear?: string | "ALL"
) {
  const rows = await prisma.realizedPlAdjustment.findMany({
    where: { portfolioId },
    select: { amount: true, term: true, bookedAt: true },
  });

  const filtered =
    !financialYear || financialYear === "ALL"
      ? rows
      : rows.filter((r) => getFinancialYear(r.bookedAt) === financialYear);

  const stcg = filtered.filter((r) => r.term === "STCG");
  const ltcg = filtered.filter((r) => r.term === "LTCG");
  const other = filtered.filter((r) => r.term === "OTHER");

  return {
    count: filtered.length,
    total: filtered.reduce((s, r) => s + r.amount, 0),
    stcg: stcg.reduce((s, r) => s + r.amount, 0),
    ltcg: ltcg.reduce((s, r) => s + r.amount, 0),
    other: other.reduce((s, r) => s + r.amount, 0),
  };
}

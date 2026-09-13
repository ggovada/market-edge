import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const member = await prisma.member.findUnique({
    where: { id },
    include: { portfolios: true },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(member);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const member = await prisma.member.update({
    where: { id },
    data: {
      ...(body.name != null && { name: body.name }),
      ...(body.contactInfo !== undefined && { contactInfo: body.contactInfo }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });
  return NextResponse.json(member);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.member.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

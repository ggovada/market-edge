import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.memberId || !body.name?.trim()) {
    return NextResponse.json({ error: "memberId and name required" }, { status: 400 });
  }
  const portfolio = await prisma.portfolio.create({
    data: {
      memberId: body.memberId,
      name: body.name.trim(),
      type: body.type ?? "demat",
      currency: body.currency ?? "INR",
    },
  });
  return NextResponse.json(portfolio, { status: 201 });
}

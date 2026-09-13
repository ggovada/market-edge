import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.taxSettings.deleteMany();
  await prisma.taxSettings.create({
    data: {
      jurisdiction: "IN",
      stcgRatePct: 20,
      ltcgRatePct: 12.5,
      ltcgExemptionAmountPerFY: 125000,
      longTermThresholdDays: 365,
      effectiveFrom: new Date("2024-07-23"),
    },
  });

  const existing = await prisma.member.findFirst({ where: { name: "Demo Member" } });
  if (existing) {
    console.log("Demo member already exists:", existing.id);
    return;
  }

  const member = await prisma.member.create({
    data: {
      name: "Demo Member",
      contactInfo: "demo@example.com",
      notes: "Sample member for local testing",
      portfolios: {
        create: {
          name: "Primary Demat",
          type: "demat",
          currency: "INR",
        },
      },
    },
    include: { portfolios: true },
  });

  console.log("Seeded member", member.id, "portfolio", member.portfolios[0].id);
  console.log("Import sample-trades.csv into the portfolio, or log trades manually.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

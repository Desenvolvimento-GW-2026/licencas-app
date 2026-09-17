import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const cliente = searchParams.get("cliente");
  const status = searchParams.get("status");
  const mes = searchParams.get("mes");
  const ano = searchParams.get("ano");

  const where: Record<string, unknown> = {};

  if (cliente) where.cliente = { contains: cliente };
  if (status) where.status = status;

  if (ano) {
    const year = parseInt(ano);
    const month = mes ? parseInt(mes) - 1 : 0;
    const start = mes
      ? new Date(year, month, 1)
      : new Date(year, 0, 1);
    const end = mes
      ? new Date(year, month + 1, 1)
      : new Date(year + 1, 0, 1);
    where.validade = { gte: start, lt: end };
  }

  const licenses = await prisma.license.findMany({
    where,
    orderBy: { validade: "asc" },
  });

  return NextResponse.json(licenses);
}

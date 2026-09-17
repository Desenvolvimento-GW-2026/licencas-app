import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Seed error: ADMIN_EMAIL and ADMIN_PASSWORD env vars required");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { password_hash: hash },
    create: {
      email,
      password_hash: hash,
      name: "Administrador",
    },
  });
  console.log(`Seed: admin user upserted (${email})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

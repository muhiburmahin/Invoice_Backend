import "dotenv/config";

import { applyLegacyEnvAliases } from "../src/app/config/legacyEnv";
import { prisma } from "../src/app/shared/prisma";

applyLegacyEnvAliases();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`Database already has ${userCount} user(s). Skipping seed.`);
    return;
  }

  console.log("No users in database.");
  console.log("Create your first account via Better Auth:");
  console.log("  POST /api/auth/sign-up/email");
  console.log("Business + FREE subscription are created automatically on signup.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

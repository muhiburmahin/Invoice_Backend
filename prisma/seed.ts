import "dotenv/config";

import { applyLegacyEnvAliases } from "../src/app/config/legacyEnv";
import { prisma } from "../src/app/shared/prisma";

applyLegacyEnvAliases();

/**
 * Promotes an existing user (matched by SUPER_ADMIN_EMAIL env) to SUPER_ADMIN.
 * The user must register first via POST /api/v1/auth/register; this script
 * just flips their role.
 *
 * Set `SUPER_ADMIN_EMAIL` in `.env` and run: `npm run db:seed`.
 */
async function promoteSuperAdmin(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("ℹ  SUPER_ADMIN_EMAIL not set — skipping admin bootstrap.");
    console.log("   To promote a user later, set SUPER_ADMIN_EMAIL in .env and re-run `npm run db:seed`.");
    return;
  }

  const desiredName = process.env.SUPER_ADMIN_NAME?.trim().replace(/^"|"$/g, "");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.log(`✗ No user with email "${email}" yet.`);
    console.log(`   Register first via POST /api/v1/auth/register, then re-run \`npm run db:seed\`.`);
    return;
  }

  const data: {
    role: "SUPER_ADMIN";
    isVerified: true;
    isActive: true;
    name?: string;
  } = {
    role: "SUPER_ADMIN",
    isVerified: true,
    isActive: true,
  };
  if (desiredName && desiredName !== user.name) {
    data.name = desiredName;
  }

  if (user.role === "SUPER_ADMIN" && !data.name) {
    console.log(`✓ ${user.email} is already SUPER_ADMIN.`);
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { email: true, name: true, role: true },
  });

  console.log(
    `✓ Promoted ${updated.email} → ${updated.role} (name: "${updated.name}").`,
  );
}

async function main(): Promise<void> {
  const userCount = await prisma.user.count();
  console.log(`Database has ${userCount} user(s).`);

  if (userCount === 0) {
    console.log("\nNo users in database yet.");
    console.log("1) Register via POST /api/v1/auth/register");
    console.log("2) Set SUPER_ADMIN_EMAIL in .env to your registered email");
    console.log("3) Run `npm run db:seed` again to promote yourself.\n");
    return;
  }

  await promoteSuperAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

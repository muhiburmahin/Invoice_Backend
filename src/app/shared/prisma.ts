import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { config } from "../config";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: config.isProduction ? ["error"] : ["query", "error", "warn"],
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

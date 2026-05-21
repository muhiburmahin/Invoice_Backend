import { prisma } from "../shared/prisma";

export type ReadinessChecks = {
  database: "up" | "down";
};

/** DB ping for load balancer / orchestrator readiness probes */
export async function getReadiness(): Promise<{
  ready: boolean;
  checks: ReadinessChecks;
}> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true, checks: { database: "up" } };
  } catch {
    return { ready: false, checks: { database: "down" } };
  }
}

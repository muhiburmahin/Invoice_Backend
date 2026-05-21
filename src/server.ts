import "dotenv/config";

import app from "./app";
import { config } from "./app/config";
import { prisma } from "./app/shared/prisma";
import { logger } from "./app/shared/logger";
import { startScheduledJobs, stopScheduledJobs } from "./app/services/jobs";

const SHUTDOWN_MS = 10_000;

const server = app.listen(config.port, () => {
  logger.info(
    `Server running on http://localhost:${config.port} [${config.nodeEnv}]`,
  );
  startScheduledJobs();
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down...`);
  stopScheduledJobs();
  const force = setTimeout(() => {
    logger.error("Forced exit after shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_MS);

  server.close(async () => {
    clearTimeout(force);
    try {
      await prisma.$disconnect();
    } catch (e) {
      logger.error(String(e));
    }
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  logger.error(error.message, { stack: error.stack });
  process.exit(1);
});

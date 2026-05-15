import "dotenv/config";

import app from "./app";
import { config } from "./app/config";
import { prisma } from "./app/shared/prisma";
import { logger } from "./app/shared/logger";

const server = app.listen(config.port, () => {
  logger.info(
    `Server running on http://localhost:${config.port} [${config.nodeEnv}]`,
  );
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
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
